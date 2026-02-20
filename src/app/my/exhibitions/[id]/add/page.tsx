"use client";

import { useCallback, useEffect, useState } from "react";
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
import { formatSupabaseError, logSupabaseError } from "@/lib/supabase/errors";

export default function AddWorkToExhibitionPage() {
  const params = useParams();
  const { t } = useT();
  const id = typeof params.id === "string" ? params.id : "";
  const [artworks, setArtworks] = useState<ArtworkWithLikes[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

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

  async function handleAdd(workId: string) {
    if (!id) return;
    setAddingId(workId);
    setError(null);
    const { error: err } = await addWorkToExhibition(id, workId);
    setAddingId(null);
    if (err) {
      logSupabaseError("addWorkToExhibition", err);
      setError(formatSupabaseError(err, "Failed to add"));
      return;
    }
    setDoneIds((prev) => new Set(prev).add(workId));
  }

  if (!id) {
    return (
      <AuthGate>
        <main className="mx-auto max-w-4xl px-4 py-8">
          <p className="text-zinc-600">Invalid exhibition.</p>
        </main>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <Link href={`/my/exhibitions/${id}`} className="text-sm text-zinc-600 hover:text-zinc-900">
            ← {t("common.backTo")} {t("exhibition.myExhibitions")}
          </Link>
        </div>

        <h1 className="mb-2 text-xl font-semibold text-zinc-900">{t("exhibition.addWork")}</h1>
        <p className="mb-6 text-sm text-zinc-500">
          {t("exhibition.addExistingWork")}. {t("exhibition.uploadNewWork")}{" "}
          <Link href={`/upload?addToExhibition=${id}`} className="text-zinc-700 underline hover:text-zinc-900">
            /upload
          </Link>
        </p>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="text-sm text-zinc-500">{t("common.loading")}</p>
        ) : artworks.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 py-8 text-center">
            <p className="mb-4 text-sm text-zinc-600">{t("me.noWorks")}</p>
            <Link
              href={`/upload?addToExhibition=${id}`}
              className="inline-block rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              {t("exhibition.uploadNewWork")}
            </Link>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {artworks.map((art) => {
              const img = art.artwork_images?.[0]?.storage_path;
              const added = doneIds.has(art.id);
              return (
                <li key={art.id} className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
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
                      <div className="aspect-[4/3] bg-zinc-100 flex items-center justify-center text-zinc-400 text-sm">
                        No image
                      </div>
                    )}
                    <div className="p-3">
                      <p className="font-medium text-zinc-900">{art.title ?? "Untitled"}</p>
                      <p className="text-xs text-zinc-500">{art.year ?? ""}</p>
                    </div>
                  </Link>
                  <div className="border-t border-zinc-100 px-3 py-2">
                    {added ? (
                      <span className="text-xs font-medium text-green-600">{t("common.saved")}</span>
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
      </main>
    </AuthGate>
  );
}
