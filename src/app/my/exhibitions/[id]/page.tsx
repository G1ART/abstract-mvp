"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Image from "next/image";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import {
  deleteExhibitionMedia,
  ensureDefaultExhibitionMediaBuckets,
  getExhibitionById,
  groupExhibitionMediaByBucket,
  insertExhibitionMedia,
  listExhibitionMedia,
  listExhibitionMediaBuckets,
  listWorksInExhibition,
  removeWorkFromExhibition,
  upsertExhibitionMediaBucket,
  updateExhibitionMediaBucketOrder,
  updateExhibitionMediaOrder,
  updateExhibitionWorksOrder,
  type ExhibitionMediaBucket,
  type ExhibitionMediaBucketRow,
  type ExhibitionMediaRow,
  type ExhibitionRow,
  type ExhibitionWorkRow,
} from "@/lib/supabase/exhibitions";
import { getArtworksByIds, getArtworkImageUrl, type ArtworkWithLikes } from "@/lib/supabase/artworks";
import { removeStorageFile, uploadExhibitionMedia } from "@/lib/supabase/storage";
import { formatSupabaseError, logSupabaseError } from "@/lib/supabase/errors";

const STATUS_LABELS: Record<string, string> = {
  planned: "exhibition.statusPlanned",
  live: "exhibition.statusLive",
  ended: "exhibition.statusEnded",
};

type UploadQueueItem = {
  id: string;
  file: File;
  previewUrl: string;
};

type UploadQueue = {
  bucket: ExhibitionMediaBucket;
  items: UploadQueueItem[];
};

function moveInArray<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export default function ExhibitionDetailPage() {
  const params = useParams();
  const { t } = useT();
  const id = typeof params.id === "string" ? params.id : "";
  const [exhibition, setExhibition] = useState<ExhibitionRow | null>(null);
  const [works, setWorks] = useState<ExhibitionWorkRow[]>([]);
  const [artworks, setArtworks] = useState<ArtworkWithLikes[]>([]);
  const [media, setMedia] = useState<ExhibitionMediaRow[]>([]);
  const [mediaBucketRows, setMediaBucketRows] = useState<ExhibitionMediaBucketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newBucketTitle, setNewBucketTitle] = useState("");
  const [uploadQueue, setUploadQueue] = useState<UploadQueue | null>(null);
  const [dragQueueItemId, setDragQueueItemId] = useState<string | null>(null);
  const [dragArtistBucketId, setDragArtistBucketId] = useState<string | null>(null);
  const [dragArtistItem, setDragArtistItem] = useState<{ bucketId: string; itemId: string } | null>(null);
  const [dragMediaBucketKey, setDragMediaBucketKey] = useState<string | null>(null);
  const [dragMediaItem, setDragMediaItem] = useState<{ bucketKey: string; itemId: string } | null>(null);
  const [artistBucketOrder, setArtistBucketOrder] = useState<string[]>([]);
  const [artistItemOrder, setArtistItemOrder] = useState<Record<string, string[]>>({});
  const [mediaBucketOrder, setMediaBucketOrder] = useState<string[]>([]);
  const [mediaItemOrder, setMediaItemOrder] = useState<Record<string, string[]>>({});

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    await ensureDefaultExhibitionMediaBuckets(id);
    const [exRes, worksRes, mediaRes, bucketRes] = await Promise.all([
      getExhibitionById(id),
      listWorksInExhibition(id),
      listExhibitionMedia(id),
      listExhibitionMediaBuckets(id),
    ]);
    if (exRes.error || !exRes.data) {
      setLoading(false);
      setError(exRes.error ? (exRes.error instanceof Error ? exRes.error.message : "Not found") : "Not found");
      return;
    }
    setExhibition(exRes.data);
    setWorks(worksRes.data ?? []);
    setMedia(mediaRes.data ?? []);
    setMediaBucketRows(bucketRes.data ?? []);
    if ((worksRes.data ?? []).length === 0) {
      setArtworks([]);
      setLoading(false);
      return;
    }
    const { data: artList } = await getArtworksByIds(worksRes.data!.map((w) => w.work_id));
    setArtworks(artList ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const artworkById = useMemo(() => new Map(artworks.map((a) => [a.id, a])), [artworks]);
  const orderedArtworks = useMemo(
    () => works.map((w) => artworkById.get(w.work_id)).filter((a): a is ArtworkWithLikes => !!a),
    [works, artworkById]
  );

  const byArtistBase = useMemo(() => {
    const listByArtist = new Map<string, ArtworkWithLikes[]>();
    const artistNameById = new Map<string, string>();
    const artistOrder: string[] = [];
    for (const art of orderedArtworks) {
      const artistId = art.artist_id ?? "";
      if (!listByArtist.has(artistId)) {
        listByArtist.set(artistId, []);
        artistOrder.push(artistId);
      }
      listByArtist.get(artistId)!.push(art);
      const profile = art.profiles as { display_name?: string; username?: string } | null | undefined;
      const artistName = profile?.display_name?.trim() || profile?.username || "Artist";
      artistNameById.set(artistId, artistName);
    }
    return artistOrder.map((artistId) => ({
      artistId,
      artistName: artistNameById.get(artistId) ?? "Artist",
      list: listByArtist.get(artistId) ?? [],
    }));
  }, [orderedArtworks]);

  const mediaBucketsBase = useMemo(
    () => groupExhibitionMediaByBucket(media, (k) => t(k), mediaBucketRows),
    [media, mediaBucketRows, t]
  );

  useEffect(() => {
    const nextArtistBucketOrder = byArtistBase.map((b) => b.artistId);
    const nextArtistItemOrder: Record<string, string[]> = {};
    for (const b of byArtistBase) nextArtistItemOrder[b.artistId] = b.list.map((x) => x.id);
    setArtistBucketOrder(nextArtistBucketOrder);
    setArtistItemOrder(nextArtistItemOrder);
  }, [byArtistBase]);

  useEffect(() => {
    const nextMediaBucketOrder = mediaBucketsBase.map((b) => b.key);
    const nextMediaItemOrder: Record<string, string[]> = {};
    for (const b of mediaBucketsBase) nextMediaItemOrder[b.key] = b.items.map((x) => x.id);
    setMediaBucketOrder(nextMediaBucketOrder);
    setMediaItemOrder(nextMediaItemOrder);
  }, [mediaBucketsBase]);

  const byArtist = useMemo(() => {
    const map = new Map(byArtistBase.map((b) => [b.artistId, b]));
    const order = artistBucketOrder.length ? artistBucketOrder : byArtistBase.map((b) => b.artistId);
    const out = order.map((artistId) => map.get(artistId)).filter(Boolean) as typeof byArtistBase;
    for (const b of byArtistBase) if (!order.includes(b.artistId)) out.push(b);
    return out.map((bucket) => {
      const ids = artistItemOrder[bucket.artistId] ?? bucket.list.map((a) => a.id);
      const local = new Map(bucket.list.map((a) => [a.id, a]));
      const ordered = ids.map((x) => local.get(x)).filter(Boolean) as ArtworkWithLikes[];
      for (const a of bucket.list) if (!ids.includes(a.id)) ordered.push(a);
      return { ...bucket, list: ordered };
    });
  }, [artistBucketOrder, artistItemOrder, byArtistBase]);

  const mediaBuckets = useMemo(() => {
    const map = new Map(mediaBucketsBase.map((b) => [b.key, b]));
    const order = mediaBucketOrder.length ? mediaBucketOrder : mediaBucketsBase.map((b) => b.key);
    const out = order.map((k) => map.get(k)).filter(Boolean) as ExhibitionMediaBucket[];
    for (const b of mediaBucketsBase) if (!order.includes(b.key)) out.push(b);
    return out.map((bucket) => {
      const ids = mediaItemOrder[bucket.key] ?? bucket.items.map((m) => m.id);
      const local = new Map(bucket.items.map((m) => [m.id, m]));
      const ordered = ids.map((x) => local.get(x)).filter(Boolean) as ExhibitionMediaRow[];
      for (const m of bucket.items) if (!ids.includes(m.id)) ordered.push(m);
      return { ...bucket, items: ordered };
    });
  }, [mediaBucketOrder, mediaItemOrder, mediaBucketsBase]);

  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);

  async function persistArtistOrder(nextBucketOrder: string[], nextItemOrder: Record<string, string[]>) {
    if (!id) return;
    const seen = new Set<string>();
    const flattened: string[] = [];
    for (const bucketId of nextBucketOrder) {
      const ids = nextItemOrder[bucketId] ?? [];
      for (const workId of ids) {
        if (!seen.has(workId) && artworkById.has(workId)) {
          seen.add(workId);
          flattened.push(workId);
        }
      }
    }
    const { error: err } = await updateExhibitionWorksOrder(id, flattened);
    if (err) {
      setError(formatSupabaseError(err, "Failed to save artist order"));
      return;
    }
    await fetchData();
  }

  async function persistMediaOrder(nextBucketOrder: string[], nextItemOrder: Record<string, string[]>) {
    if (!id) return;
    const seen = new Set<string>();
    const flattened: string[] = [];
    for (const bucketKey of nextBucketOrder) {
      const ids = nextItemOrder[bucketKey] ?? [];
      for (const mediaId of ids) {
        if (!seen.has(mediaId) && mediaById.has(mediaId)) {
          seen.add(mediaId);
          flattened.push(mediaId);
        }
      }
    }
    const { error: err } = await updateExhibitionMediaOrder(id, flattened);
    if (err) {
      setError(formatSupabaseError(err, "Failed to save media order"));
      return;
    }
    await fetchData();
  }

  async function persistMediaBucketOrder(nextBucketOrder: string[]) {
    if (!id) return;
    const { error: err } = await updateExhibitionMediaBucketOrder(id, nextBucketOrder);
    if (err) {
      setError(formatSupabaseError(err, "Failed to save bucket order"));
      return;
    }
    await fetchData();
  }

  function prepareBucketUpload(bucket: ExhibitionMediaBucket, files: FileList | null) {
    if (!files || files.length === 0) return;
    const items: UploadQueueItem[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setUploadQueue({ bucket, items });
  }

  async function uploadQueueItems() {
    if (!id || !uploadQueue || uploadQueue.items.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      await upsertExhibitionMediaBucket({
        exhibition_id: id,
        key: uploadQueue.bucket.key,
        title: uploadQueue.bucket.title,
        type: uploadQueue.bucket.insertType,
        sort_order: mediaBucketOrder.indexOf(uploadQueue.bucket.key) >= 0
          ? mediaBucketOrder.indexOf(uploadQueue.bucket.key)
          : mediaBucketOrder.length,
      });
      const maxSort = media.reduce((mx, m) => Math.max(mx, m.sort_order ?? 0), 0);
      for (let i = 0; i < uploadQueue.items.length; i++) {
        const q = uploadQueue.items[i];
        const storagePath = await uploadExhibitionMedia(q.file, id);
        const { error: err } = await insertExhibitionMedia({
          exhibition_id: id,
          type: uploadQueue.bucket.insertType,
          bucket_title: uploadQueue.bucket.insertBucketTitle,
          storage_path: storagePath,
          sort_order: maxSort + i + 1,
        });
        if (err) {
          setError(formatSupabaseError(err, "Failed to upload image"));
          setUploading(false);
          return;
        }
      }
      uploadQueue.items.forEach((q) => URL.revokeObjectURL(q.previewUrl));
      setUploadQueue(null);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function clearUploadQueue() {
    if (!uploadQueue) return;
    uploadQueue.items.forEach((q) => URL.revokeObjectURL(q.previewUrl));
    setUploadQueue(null);
  }

  async function handleRemoveWork(workId: string) {
    if (!id) return;
    setRemovingId(workId);
    const { error: err } = await removeWorkFromExhibition(id, workId);
    setRemovingId(null);
    if (err) {
      logSupabaseError("removeWorkFromExhibition", err);
      setError(formatSupabaseError(err, "Failed to remove"));
      return;
    }
    await fetchData();
  }

  async function handleDeleteMedia(m: ExhibitionMediaRow) {
    setDeletingMediaId(m.id);
    const { error: err } = await deleteExhibitionMedia(m.id);
    if (!err) await removeStorageFile(m.storage_path);
    setDeletingMediaId(null);
    if (err) {
      setError(formatSupabaseError(err, "Failed to delete image"));
      return;
    }
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

            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

            {uploadQueue && (
              <section className="mb-8 rounded-lg border border-zinc-300 bg-white p-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-900">
                  {uploadQueue.bucket.title} · 업로드 대기 ({uploadQueue.items.length})
                </h3>
                <p className="mb-3 text-xs text-zinc-500">드래그로 업로드 전 순서를 조정할 수 있습니다.</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {uploadQueue.items.map((q, idx) => (
                    <div
                      key={q.id}
                      draggable
                      onDragStart={() => setDragQueueItemId(q.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (!dragQueueItemId || dragQueueItemId === q.id || !uploadQueue) return;
                        const from = uploadQueue.items.findIndex((x) => x.id === dragQueueItemId);
                        const to = uploadQueue.items.findIndex((x) => x.id === q.id);
                        const next = moveInArray(uploadQueue.items, from, to);
                        setUploadQueue({ ...uploadQueue, items: next });
                      }}
                      className="relative aspect-square overflow-hidden rounded border border-zinc-200 bg-zinc-100"
                    >
                      <Image src={q.previewUrl} alt={q.file.name} fill className="object-cover" sizes="120px" />
                      <div className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                        {idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={uploadQueueItems}
                    className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {uploading ? t("common.loading") : "업로드 실행"}
                  </button>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={clearUploadQueue}
                    className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </section>
            )}

            {byArtist.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-sm font-medium text-zinc-700">{t("exhibition.byArtist")} · Drag & Drop</h2>
                <div className="space-y-6">
                  {byArtist.map(({ artistId, artistName, list }) => (
                    <div
                      key={artistId}
                      draggable
                      onDragStart={() => setDragArtistBucketId(artistId)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async () => {
                        if (!dragArtistBucketId || dragArtistBucketId === artistId) return;
                        const from = artistBucketOrder.indexOf(dragArtistBucketId);
                        const to = artistBucketOrder.indexOf(artistId);
                        const nextBucketOrder = moveInArray(artistBucketOrder, from, to);
                        setArtistBucketOrder(nextBucketOrder);
                        setDragArtistBucketId(null);
                        await persistArtistOrder(nextBucketOrder, artistItemOrder);
                      }}
                      className="rounded-lg border border-zinc-200 bg-white p-4"
                    >
                      <p className="mb-3 cursor-move text-sm font-medium text-zinc-900">{artistName}</p>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
                        {list.map((art) => {
                          const img = art.artwork_images?.[0]?.storage_path;
                          return (
                            <div
                              key={art.id}
                              draggable
                              onDragStart={() => setDragArtistItem({ bucketId: artistId, itemId: art.id })}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={async () => {
                                if (!dragArtistItem || dragArtistItem.bucketId !== artistId || dragArtistItem.itemId === art.id) return;
                                const currentIds = artistItemOrder[artistId] ?? list.map((x) => x.id);
                                const from = currentIds.indexOf(dragArtistItem.itemId);
                                const to = currentIds.indexOf(art.id);
                                const nextIds = moveInArray(currentIds, from, to);
                                const nextItemOrder = { ...artistItemOrder, [artistId]: nextIds };
                                setArtistItemOrder(nextItemOrder);
                                setDragArtistItem(null);
                                await persistArtistOrder(artistBucketOrder, nextItemOrder);
                              }}
                              className="relative"
                            >
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
                                  <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">No image</div>
                                )}
                              </Link>
                              <div className="mt-1 truncate text-xs text-zinc-600">{art.title ?? "Untitled"}</div>
                              <button
                                type="button"
                                onClick={() => handleRemoveWork(art.id)}
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
              <section
                key={bucket.key}
                draggable
                onDragStart={() => setDragMediaBucketKey(bucket.key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async () => {
                  if (!dragMediaBucketKey || dragMediaBucketKey === bucket.key) return;
                  const from = mediaBucketOrder.indexOf(dragMediaBucketKey);
                  const to = mediaBucketOrder.indexOf(bucket.key);
                  const nextBucketOrder = moveInArray(mediaBucketOrder, from, to);
                  setMediaBucketOrder(nextBucketOrder);
                  setDragMediaBucketKey(null);
                  await persistMediaBucketOrder(nextBucketOrder);
                }}
                className="mb-8"
              >
                <h2 className="mb-3 cursor-move text-sm font-medium text-zinc-700">{bucket.title} · Drag & Drop</h2>
                {bucket.items.length === 0 ? (
                  <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-4 text-sm text-zinc-500">{t("exhibition.noMediaYet")}</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {bucket.items.map((m) => (
                      <div
                        key={m.id}
                        draggable
                        onDragStart={() => setDragMediaItem({ bucketKey: bucket.key, itemId: m.id })}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={async () => {
                          if (!dragMediaItem || dragMediaItem.bucketKey !== bucket.key || dragMediaItem.itemId === m.id) return;
                          const currentIds = mediaItemOrder[bucket.key] ?? bucket.items.map((x) => x.id);
                          const from = currentIds.indexOf(dragMediaItem.itemId);
                          const to = currentIds.indexOf(m.id);
                          const nextIds = moveInArray(currentIds, from, to);
                          const nextItemOrder = { ...mediaItemOrder, [bucket.key]: nextIds };
                          setMediaItemOrder(nextItemOrder);
                          setDragMediaItem(null);
                          await persistMediaOrder(mediaBucketOrder, nextItemOrder);
                        }}
                        className="relative aspect-square overflow-hidden rounded border border-zinc-200 bg-zinc-100"
                      >
                        <Image src={getArtworkImageUrl(m.storage_path, "thumb")} alt="" fill className="object-cover" sizes="150px" />
                        <button
                          type="button"
                          onClick={() => handleDeleteMedia(m)}
                          disabled={deletingMediaId === m.id}
                          className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-black/70 disabled:opacity-50"
                        >
                          {deletingMediaId === m.id ? "..." : "삭제"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="mt-2 inline-block">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => {
                      prepareBucketUpload(bucket, e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <span className="inline-block cursor-pointer rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                    {t("exhibition.addPhoto")} (벌크)
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
                    multiple
                    className="sr-only"
                    disabled={!newBucketTitle.trim() || uploading}
                    onChange={(e) => {
                      if (!newBucketTitle.trim()) return;
                      prepareBucketUpload(
                        {
                          key: newBucketTitle.trim(),
                          title: newBucketTitle.trim(),
                          items: [],
                          insertType: "custom",
                          insertBucketTitle: newBucketTitle.trim(),
                        },
                        e.target.files
                      );
                      e.target.value = "";
                    }}
                  />
                  <span className="inline-block cursor-pointer rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">
                    {t("exhibition.addPhoto")} (벌크)
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
