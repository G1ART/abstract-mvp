"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Image from "next/image";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import {
  getExhibitionById,
  listExhibitionMedia,
  listWorksInExhibition,
  removeWorkFromExhibition,
  groupExhibitionMediaByBucket,
  insertExhibitionMedia,
  type ExhibitionMediaBucket,
  type ExhibitionMediaRow,
  type ExhibitionRow,
  type ExhibitionWorkRow,
} from "@/lib/supabase/exhibitions";
import { getArtworksByIds, getArtworkImageUrl, type ArtworkWithLikes } from "@/lib/supabase/artworks";
import { uploadExhibitionMedia } from "@/lib/supabase/storage";
import { formatSupabaseError, logSupabaseError } from "@/lib/supabase/errors";

const STATUS_LABELS: Record<string, string> = {
  planned: "exhibition.statusPlanned",
  live: "exhibition.statusLive",
  ended: "exhibition.statusEnded",
};

export default function ExhibitionDetailPage() {
  const params = useParams();
  const { t } = useT();
  const id = typeof params.id === "string" ? params.id : "";
  const [exhibition, setExhibition] = useState<ExhibitionRow | null>(null);
  const [works, setWorks] = useState<ExhibitionWorkRow[]>([]);
  const [artworks, setArtworks] = useState<ArtworkWithLikes[]>([]);
  const [media, setMedia] = useState<ExhibitionMediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [uploadingBucketKey, setUploadingBucketKey] = useState<string | null>(null);
  const [newBucketTitle, setNewBucketTitle] = useState("");
  const [newBucketUploading, setNewBucketUploading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const [exRes, worksRes, mediaRes] = await Promise.all([
      getExhibitionById(id),
      listWorksInExhibition(id),
      listExhibitionMedia(id),
    ]);
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

  const mediaBuckets = useMemo(
    () => groupExhibitionMediaByBucket(media, (k) => t(k)),
    [media, t]
  );

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleAddPhoto(bucket: ExhibitionMediaBucket, file: File) {
    if (!id) return;
    setUploadingBucketKey(bucket.key);
    setError(null);
    try {
      const storagePath = await uploadExhibitionMedia(file, id);
      const { error: err } = await insertExhibitionMedia({
        exhibition_id: id,
        type: bucket.insertType,
        bucket_title: bucket.insertBucketTitle,
        storage_path: storagePath,
      });
      if (err) {
        setError(formatSupabaseError(err, "Failed to add photo"));
        return;
      }
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingBucketKey(null);
    }
  }

  async function handleAddCustomBucket(title: string, file: File) {
    if (!id || !title.trim()) return;
    setNewBucketUploading(true);
    setError(null);
    try {
      const storagePath = await uploadExhibitionMedia(file, id);
      const { error: err } = await insertExhibitionMedia({
        exhibition_id: id,
        type: "custom",
        bucket_title: title.trim(),
        storage_path: storagePath,
      });
      if (err) {
        setError(formatSupabaseError(err, "Failed to add bucket"));
        return;
      }
      setNewBucketTitle("");
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setNewBucketUploading(false);
    }
  }

  async function handleRemove(workId: string) {
    if (!id) return;
    setRemovingId(workId);
    const { error: err } = await removeWorkFromExhibition(id, workId);
    setRemovingId(null);
    if (err) {
      logSupabaseError("removeWorkFromExhibition", err);
      setError(formatSupabaseError(err, "Failed to remove"));
      return;
    }
    setError(null);
    await fetchData();
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
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link href="/my?tab=exhibitions" className="text-sm text-zinc-600 hover:text-zinc-900">
            ← {t("common.backTo")} {t("nav.myProfile")}
          </Link>
          <span className="text-zinc-400">|</span>
          <Link href="/my/exhibitions" className="text-sm text-zinc-600 hover:text-zinc-900">
            {t("exhibition.myExhibitions")}
          </Link>
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
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/my/exhibitions/${id}/edit`}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {t("common.edit")}
                </Link>
                <Link
                  href={`/my/exhibitions/${id}/add`}
                  className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  {t("exhibition.addWork")}
                </Link>
              </div>
            </header>

            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

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
                              <button
                                type="button"
                                onClick={() => handleRemove(art.id)}
                                disabled={removingId === art.id}
                                className="mt-0.5 text-[10px] font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                              >
                                {removingId === art.id ? "..." : t("exhibition.removeFromExhibition")}
                              </button>
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
                <p className="mb-4 text-sm text-zinc-600">{t("exhibition.noWorks")}</p>
                <Link
                  href={`/my/exhibitions/${id}/add`}
                  className="inline-block rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  {t("exhibition.addWork")}
                </Link>
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
                      <div key={m.id} className="relative aspect-square overflow-hidden rounded border border-zinc-200 bg-zinc-100">
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
                <label className="mt-2 inline-block">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={uploadingBucketKey !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAddPhoto(bucket, file);
                      e.target.value = "";
                    }}
                  />
                  <span className="inline-block rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer">
                    {uploadingBucketKey === bucket.key ? t("common.loading") : t("exhibition.addPhoto")}
                  </span>
                </label>
              </section>
            ))}

            <section className="mb-8 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 p-4">
              <h2 className="mb-2 text-sm font-medium text-zinc-700">{t("exhibition.addCustomBucket")}</h2>
              <p className="mb-3 text-xs text-zinc-500">{t("exhibition.addCustomBucketHint")}</p>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  type="text"
                  value={newBucketTitle}
                  onChange={(e) => setNewBucketTitle(e.target.value)}
                  placeholder={t("exhibition.bucketTitlePlaceholder")}
                  className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
                <label className="inline-block">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    id="new-bucket-file"
                    disabled={newBucketUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && newBucketTitle.trim()) handleAddCustomBucket(newBucketTitle.trim(), file);
                      e.target.value = "";
                    }}
                  />
                  <span className="inline-block rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 cursor-pointer">
                    {newBucketUploading ? t("common.loading") : t("exhibition.addPhoto")}
                  </span>
                </label>
              </div>
            </section>
          </>
        )}
      </main>
    </AuthGate>
  );
}
