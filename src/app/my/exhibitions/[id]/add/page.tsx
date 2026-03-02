"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import {
  addWorkToExhibition,
  listWorksInExhibition,
} from "@/lib/supabase/exhibitions";
import {
  listMyArtworks,
  listPublicArtworksListedByProfileId,
  getArtworkImageUrl,
  type ArtworkWithLikes,
} from "@/lib/supabase/artworks";
import { getMyProfile } from "@/lib/supabase/me";
import { searchPeople } from "@/lib/supabase/artists";
import { formatSupabaseError, logSupabaseError } from "@/lib/supabase/errors";
import {
  createClaimForExistingArtist,
  createExternalArtistAndClaim,
} from "@/lib/provenance/rpc";

type Participant = {
  id: string;
  username: string | null;
  display_name: string | null;
};

export default function AddWorkToExhibitionPage() {
  const params = useParams();
  const { t } = useT();
  const id = typeof params.id === "string" ? params.id : "";
  const [artworks, setArtworks] = useState<ArtworkWithLikes[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  // Step state: 1) 참여 작가 선택, 2) 작품 선택
  const [step, setStep] = useState<"artists" | "works">("artists");

  // 참여 작가 (온보딩된 프로필)
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [artistSearch, setArtistSearch] = useState("");
  const [artistResults, setArtistResults] = useState<Participant[]>([]);
  const [searchingArtists, setSearchingArtists] = useState(false);

  // 외부 작가 초대 (아직 온보딩되지 않은 작가)
  const [useExternalInvite, setUseExternalInvite] = useState(false);
  const [externalRows, setExternalRows] = useState<{ name: string; email: string }[]>([
    { name: "", email: "" },
  ]);
  const [invitingExternal, setInvitingExternal] = useState(false);

  // 작품 검색 (제목/설명/매체/키워드 기반 텍스트 검색; 자연어 검색의 1차 버전)
  const [workQuery, setWorkQuery] = useState("");

  const fetchArtworks = useCallback(async () => {
    if (!id) return;
    const { data: profile } = await getMyProfile();
    const profileId = (profile as { id?: string } | null)?.id;
    const [myRes, listedRes, inExhibitionRes] = await Promise.all([
      listMyArtworks({ limit: 100, publicOnly: false }),
      profileId
        ? listPublicArtworksListedByProfileId(profileId, { limit: 100 })
        : { data: [] as ArtworkWithLikes[], error: null },
      listWorksInExhibition(id),
    ]);
    const myList = myRes.data ?? [];
    const listedList = listedRes.data ?? [];
    const inExhibition = new Set((inExhibitionRes.data ?? []).map((w) => w.work_id));
    const byId = new Map<string, ArtworkWithLikes>();
    for (const a of myList) byId.set(a.id, a);
    for (const a of listedList) if (!byId.has(a.id)) byId.set(a.id, a);
    const merged = Array.from(byId.values()).sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    );
    setArtworks(merged);
    setDoneIds(inExhibition);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    fetchArtworks().finally(() => setLoading(false));
  }, [fetchArtworks]);

  // 참여 작가 검색 (온보딩된 유저)
  useEffect(() => {
    const q = artistSearch.trim();
    if (!q) {
      setArtistResults([]);
      return;
    }
    let cancelled = false;
    setSearchingArtists(true);
    searchPeople({ q, limit: 10 })
      .then(({ data }) => {
        if (cancelled) return;
        const list = (data ?? []).map((p) => ({
          id: p.id,
          username: p.username,
          display_name: p.display_name,
        }));
        setArtistResults(list);
      })
      .finally(() => {
        if (!cancelled) setSearchingArtists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artistSearch]);

  const filteredArtworks = useMemo(() => {
    const q = workQuery.trim().toLowerCase();
    const hasParticipants = participants.length > 0;
    return artworks.filter((art) => {
      const matchesParticipant = !hasParticipants
        ? true
        : participants.some((p) => {
            if (p.id === art.artist_id) return true;
            const claims = art.claims ?? [];
            return claims.some((c) => c.subject_profile_id === p.id);
          });
      if (!matchesParticipant) return false;

      if (!q) return true;
      const title = (art.title ?? "").toLowerCase();
      const medium = (art.medium ?? "").toLowerCase();
      const story = (art.story ?? "").toLowerCase();
      const keywords = Array.isArray((art as any).keywords)
        ? ((art as any).keywords as string[]).join(" ").toLowerCase()
        : "";
      return (
        title.includes(q) ||
        medium.includes(q) ||
        story.includes(q) ||
        keywords.includes(q)
      );
    });
  }, [artworks, participants, workQuery]);

  async function handleAdd(workId: string) {
    if (!id) return;
    setAddingId(workId);
    setError(null);
    const { error: err } = await addWorkToExhibition(id, workId);
    if (err) {
      setAddingId(null);
      logSupabaseError("addWorkToExhibition", err);
      setError(formatSupabaseError(err, t("common.errorSave")));
      return;
    }
    // Align provenance: create CURATED claim so "this work in this exhibition" has gallery–curator provenance.
    const art = artworks.find((a) => a.id === workId);
    if (art?.artist_id) {
      const { error: claimErr } = await createClaimForExistingArtist({
        artistProfileId: art.artist_id,
        claimType: "CURATED",
        workId,
        projectId: id,
        visibility: "public",
        period_status: "current",
      });
      if (claimErr) {
        logSupabaseError("createClaimForExistingArtist (after add to exhibition)", claimErr);
        // Don't block UI: work is already in exhibition; claim may already exist.
      }
    }
    setAddingId(null);
    setDoneIds((prev) => new Set(prev).add(workId));
  }

  if (!id) {
    return (
      <AuthGate>
        <main className="mx-auto max-w-4xl px-4 py-8">
          <p className="text-zinc-600">{t("exhibition.invalidExhibition")}</p>
        </main>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <Link href={`/my/exhibitions/${id}`} className="text-sm text-zinc-600 hover:text-zinc-900">
            ← {t("common.backTo")} {t("exhibition.myExhibitions")}
          </Link>
        </div>

        <h1 className="mb-2 text-xl font-semibold text-zinc-900">{t("exhibition.addWork")}</h1>
        <p className="mb-4 text-sm text-zinc-500">
          {t("exhibition.addExistingWork")}
        </p>

        {/* Step indicator */}
        <div className="mb-6 inline-flex rounded-full border border-zinc-200 bg-zinc-50 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setStep("artists")}
            className={`rounded-full px-3 py-1 ${
              step === "artists" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
            }`}
          >
            1. {t("exhibition.stepArtists")}
          </button>
          <button
            type="button"
            onClick={() => setStep("works")}
            className={`ml-1 rounded-full px-3 py-1 ${
              step === "works" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
            }`}
          >
            2. {t("exhibition.stepWorks")}
          </button>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {step === "artists" ? (
          <section className="space-y-6">
            <div>
              <h2 className="mb-2 text-sm font-medium text-zinc-800">
                {t("exhibition.participants")}
              </h2>
              <p className="mb-3 text-xs text-zinc-500">
                {t("exhibition.participantsHint")}
              </p>

              {/* 검색으로 참여 작가 추가 */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-700">
                  {t("upload.searchArtist")}
                </label>
                <input
                  type="text"
                  value={artistSearch}
                  onChange={(e) => setArtistSearch(e.target.value)}
                  placeholder={t("upload.artistSearchPlaceholder")}
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                />
                {searchingArtists && (
                  <p className="text-xs text-zinc-500">{t("artists.loading")}</p>
                )}
                {artistResults.length > 0 && (
                  <ul className="max-h-52 overflow-auto rounded border border-zinc-200 bg-white text-sm">
                    {artistResults.map((p) => {
                      const selected = participants.some((x) => x.id === p.id);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setParticipants((prev) =>
                                selected ? prev.filter((x) => x.id !== p.id) : [...prev, p]
                              );
                            }}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-zinc-50 ${
                              selected ? "bg-zinc-100" : ""
                            }`}
                          >
                            <span className="truncate">
                              {p.display_name || p.username || p.id}
                              {p.username && (
                                <span className="ml-1 text-xs text-zinc-500">@{p.username}</span>
                              )}
                            </span>
                            {selected && (
                              <span className="ml-2 text-[10px] uppercase text-zinc-500">
                                {t("common.selected")}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* 선택된 참여 작가 칩 */}
              {participants.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {participants.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setParticipants((prev) => prev.filter((x) => x.id !== p.id))
                      }
                      className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-200"
                    >
                      <span>{p.display_name || p.username || p.id}</span>
                      <span className="text-[10px] text-zinc-500">×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 외부 작가 초대 (온보딩 안 된 작가) */}
            <div className="border-t border-zinc-200 pt-4">
              <button
                type="button"
                onClick={() => setUseExternalInvite((v) => !v)}
                className="text-xs font-medium text-zinc-700 hover:text-zinc-900"
              >
                {useExternalInvite
                  ? t("exhibition.toggleExternalOff")
                  : t("exhibition.toggleExternalOn")}
              </button>
              {useExternalInvite && (
                <div className="mt-3 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">
                    {t("exhibition.externalArtistsHint")}
                  </p>
                  {externalRows.map((row, idx) => (
                    <div key={idx} className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => {
                          const v = e.target.value;
                          setExternalRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], name: v };
                            return next;
                          });
                        }}
                        placeholder={t("upload.externalArtistNamePlaceholder")}
                        className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="email"
                        value={row.email}
                        onChange={(e) => {
                          const v = e.target.value;
                          setExternalRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], email: v };
                            return next;
                          });
                        }}
                        placeholder={t("upload.externalArtistEmailPlaceholder")}
                        className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
                      />
                      {externalRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExternalRows((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-xs text-zinc-500 hover:text-zinc-800"
                        >
                          {t("common.remove")}
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        setExternalRows((prev) => [...prev, { name: "", email: "" }])
                      }
                      className="text-xs text-zinc-700 hover:text-zinc-900"
                    >
                      + {t("exhibition.addExternalRow")}
                    </button>
                    {invitingExternal && (
                      <p className="text-xs text-zinc-500">
                        {t("exhibition.sendingInvites")}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={async () => {
                  // 외부 작가 초대 처리 (이름 있는 행만)
                  if (useExternalInvite) {
                    const rows = externalRows
                      .map((r) => ({
                        name: r.name.trim(),
                        email: r.email.trim(),
                      }))
                      .filter((r) => r.name);
                    if (rows.length > 0) {
                      try {
                        setInvitingExternal(true);
                        for (const row of rows) {
                          const { error: extErr } = await createExternalArtistAndClaim({
                            displayName: row.name,
                            inviteEmail: row.email || null,
                            claimType: "CURATED",
                            workId: null,
                            projectId: id,
                            visibility: "public",
                            period_status: "current",
                          });
                          if (extErr) {
                            logSupabaseError(
                              "createExternalArtistAndClaim (exhibition participants)",
                              extErr
                            );
                          }
                        }
                      } finally {
                        setInvitingExternal(false);
                      }
                    }
                  }
                  setStep("works");
                }}
                className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                {t("exhibition.gotoWorksStep")}
              </button>
            </div>
          </section>
        ) : (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <span className="text-xs font-medium text-zinc-600">
                  {t("exhibition.filterByArtist")}
                </span>
                <button
                  type="button"
                  onClick={() => setParticipants([])}
                  className={`rounded-full px-3 py-1 text-xs ${
                    participants.length === 0
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }`}
                >
                  {t("common.all")}
                </button>
                {participants.map((p) => (
                  <span
                    key={p.id}
                    className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700"
                  >
                    {p.display_name || p.username || p.id}
                  </span>
                ))}
              </div>
              <div className="flex flex-1 justify-end gap-2">
                <input
                  type="text"
                  value={workQuery}
                  onChange={(e) => setWorkQuery(e.target.value)}
                  placeholder={t("exhibition.searchWorksPlaceholder")}
                  className="w-full max-w-xs rounded border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <p className="mb-3 text-xs text-zinc-500">
              {t("exhibition.uploadNewWork")}{" "}
              <Link
                href={`/upload?addToExhibition=${id}`}
                className="text-xs text-zinc-700 underline hover:text-zinc-900"
              >
                /upload
              </Link>
            </p>

            {loading ? (
              <p className="text-sm text-zinc-500">{t("common.loading")}</p>
            ) : filteredArtworks.length === 0 ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 py-8 text-center">
                <p className="mb-4 text-sm text-zinc-600">
                  {t("exhibition.noWorksForFilter")}
                </p>
                <Link
                  href={`/upload?addToExhibition=${id}`}
                  className="inline-block rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  {t("exhibition.uploadNewWork")}
                </Link>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredArtworks.map((art) => {
                  const img = art.artwork_images?.[0]?.storage_path;
                  const added = doneIds.has(art.id);
                  return (
                    <li
                      key={art.id}
                      className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
                    >
                      <Link href={`/artwork/${art.id}`} className="block">
                        {img ? (
                          <div className="relative aspect-[4/3] bg-zinc-100">
                            <Image
                              src={getArtworkImageUrl(img, "thumb")}
                              alt={art.title ?? ""}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            />
                          </div>
                        ) : (
                          <div className="flex aspect-[4/3] items-center justify-center bg-zinc-100 text-sm text-zinc-400">
                            {t("common.noImage")}
                          </div>
                        )}
                        <div className="p-3">
                          <p className="font-medium text-zinc-900">
                            {art.title ?? t("common.untitled")}
                          </p>
                          <p className="text-xs text-zinc-500">{art.year ?? ""}</p>
                        </div>
                      </Link>
                      <div className="border-t border-zinc-100 px-3 py-2">
                        {added ? (
                          <span className="text-xs font-medium text-green-600">
                            {t("common.saved")}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAdd(art.id)}
                            disabled={addingId === art.id}
                            className="text-xs font-medium text-zinc-700 hover:text-zinc-900 disabled:opacity-50"
                          >
                            {addingId === art.id ? "..." : t("exhibition.addWork")}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </main>
    </AuthGate>
  );
}
