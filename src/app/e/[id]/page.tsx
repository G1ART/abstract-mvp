"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Image from "next/image";
import { useT } from "@/lib/i18n/useT";
import {
  getExhibitionById,
  listExhibitionMedia,
  listWorksInExhibition,
  groupExhibitionMediaByBucket,
  type ExhibitionMediaRow,
  type ExhibitionRow,
  type ExhibitionWorkRow,
} from "@/lib/supabase/exhibitions";
import { getArtworksByIds, getArtworkImageUrl, type ArtworkWithLikes } from "@/lib/supabase/artworks";
import { getSession } from "@/lib/supabase/auth";

const STATUS_LABELS: Record<string, string> = {
  planned: "exhibition.statusPlanned",
  live: "exhibition.statusLive",
  ended: "exhibition.statusEnded",
};

export default function PublicExhibitionPage() {
  const params = useParams();
  const { t } = useT();
  const id = typeof params.id === "string" ? params.id : "";
  const [exhibition, setExhibition] = useState<ExhibitionRow | null>(null);
  const [works, setWorks] = useState<ExhibitionWorkRow[]>([]);
  const [artworks, setArtworks] = useState<ArtworkWithLikes[]>([]);
  const [media, setMedia] = useState<ExhibitionMediaRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const [exRes, worksRes, mediaRes, sessionRes] = await Promise.all([
      getExhibitionById(id),
      listWorksInExhibition(id),
      listExhibitionMedia(id),
      getSession(),
    ]);
    const session = sessionRes?.data?.session;
    setUserId(session?.user?.id ?? null);
    if (exRes.error || !exRes.data) {
      setLoading(false);
      setError(exRes.error ? (exRes.error instanceof Error ? exRes.error.message : "Not found") : "Not found");
      return;
    }
    setExhibition(exRes.data);
    setWorks(worksRes.data ?? []);
    setMedia(mediaRes.data ?? []);
    if ((worksRes.data ?? []).length === 0) {
      setArtworks([]);
      setLoading(false);
      return;
    }
    const { data: artList } = await getArtworksByIds(worksRes.data!.map((w) => w.work_id));
    setArtworks(artList ?? []);
    setLoading(false);
  }, [id]);

  const mediaBuckets = useMemo(() => {
    const all = groupExhibitionMediaByBucket(media, (k) => t(k));
    return all.filter((b) => b.items.length > 0);
  }, [media, t]);

  const byArtist = useMemo(() => {
    const map = new Map<string, ArtworkWithLikes[]>();
    for (const a of artworks) {
      const key = a.artist_id ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries()).map(([artistId, list]) => {
      const first = list[0];
      const profile = first?.profiles as { display_name?: string; username?: string } | null | undefined;
      const name = profile?.display_name?.trim() || profile?.username || "Artist";
      return { artistId, artistName: name, list };
    });
  }, [artworks]);

  const isOwner = exhibition && userId && (exhibition.curator_id === userId || exhibition.host_profile_id === userId);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!id) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-zinc-600">{t("common.invalid") ?? "Invalid exhibition."}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/feed" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← {t("common.backTo")} {t("nav.feed") ?? "Feed"}
        </Link>
        {isOwner && (
          <>
            <span className="text-zinc-400">|</span>
            <Link href={`/my/exhibitions/${id}`} className="text-sm text-zinc-600 hover:text-zinc-900">
              {t("exhibition.manageExhibition") ?? "전시 관리"}
            </Link>
          </>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">{t("common.loading")}</p>
      ) : !exhibition ? (
        <p className="text-zinc-600">{error ?? "Exhibition not found."}</p>
      ) : (
        <>
          <header className="mb-8">
            <h1 className="text-xl font-semibold text-zinc-900">{exhibition.title}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {exhibition.start_date && exhibition.end_date
                ? `${exhibition.start_date} – ${exhibition.end_date}`
                : exhibition.start_date ?? ""}
              {exhibition.host_name && ` · ${exhibition.host_name}`}
              {" · "}
              {t(STATUS_LABELS[exhibition.status] ?? "exhibition.statusPlanned")}
            </p>
          </header>

          {byArtist.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-medium text-zinc-700">{t("exhibition.byArtist")}</h2>
              <div className="space-y-6">
                {byArtist.map(({ artistId, artistName, list }) => (
                  <div key={artistId} className="rounded-lg border border-zinc-200 bg-white p-4">
                    <p className="mb-3 text-sm font-medium text-zinc-900">{artistName}</p>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
                      {list.map((art) => {
                        const img = art.artwork_images?.[0]?.storage_path;
                        return (
                          <div key={art.id} className="relative">
                            <Link
                              href={`/artwork/${art.id}`}
                              className="block aspect-square overflow-hidden rounded border border-zinc-100 bg-zinc-100"
                            >
                              {img ? (
                                <Image
                                  src={getArtworkImageUrl(img, "thumb")}
                                  alt={art.title ?? ""}
                                  width={120}
                                  height={120}
                                  className="h-full w-full object-cover"
                                  sizes="120px"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                                  No image
                                </div>
                              )}
                            </Link>
                            <div className="mt-1 truncate text-xs text-zinc-600">{art.title ?? "Untitled"}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {artworks.length === 0 && (
            <div className="mb-8 rounded-lg border border-zinc-200 bg-zinc-50 py-8 text-center">
              <p className="text-sm text-zinc-600">{t("exhibition.noWorks")}</p>
            </div>
          )}

          {mediaBuckets.map((bucket) => (
            <section key={bucket.key} className="mb-8">
              <h2 className="mb-3 text-sm font-medium text-zinc-700">{bucket.title}</h2>
              {bucket.items.length === 0 ? (
                <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-4 text-sm text-zinc-500">
                  {t("exhibition.noMediaYet")}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {bucket.items.map((m) => (
                    <div
                      key={m.id}
                      className="relative aspect-square overflow-hidden rounded border border-zinc-200 bg-zinc-100"
                    >
                      <Image
                        src={getArtworkImageUrl(m.storage_path, "thumb")}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="150px"
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </main>
  );
}
