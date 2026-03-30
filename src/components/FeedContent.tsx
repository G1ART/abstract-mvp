"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/useT";
import { logBetaEvent } from "@/lib/beta/logEvent";
import { markFeedPerf, readFeedPerf } from "@/lib/feed/feedPerf";
import {
  type ArtworkWithLikes,
  type ArtworkCursor,
  listFollowingArtworks,
  listPublicArtworks,
  listPublicArtworksForProfile,
} from "@/lib/supabase/artworks";
import { getFollowingIds } from "@/lib/supabase/artists";
import {
  listExhibitionsForFollowingFeed,
  listPublicExhibitionsForFeed,
  type ExhibitionWithCredits,
  type ExhibitionCursor,
} from "@/lib/supabase/exhibitions";
import { getLikedArtworkIds } from "@/lib/supabase/likes";
import { getPeopleRecs, type PeopleRec } from "@/lib/supabase/peopleRecs";
import { FeedArtworkCard } from "./FeedArtworkCard";
import { FeedDiscoveryBlock } from "./FeedDiscoveryBlock";
import { FeedExhibitionCard } from "./FeedExhibitionCard";

const REC_CACHE_TTL_MS = 3 * 60 * 1000; // 3 min
const FEED_BG_REFRESH_TTL_MS = 90_000;
const INTERLEAVE_EVERY = 5; // 5 items (artwork/exhibition) : 1 discovery block
const STRONG_SCORE_THRESHOLD = 2;
const DISCOVERY_BLOCKS_MAX = 4;

type FeedEntry =
  | { type: "artwork"; created_at: string | null; artwork: ArtworkWithLikes }
  | { type: "exhibition"; created_at: string | null; exhibition: ExhibitionWithCredits };

type FeedItem =
  | { type: "artwork"; artwork: ArtworkWithLikes }
  | { type: "exhibition"; exhibition: ExhibitionWithCredits }
  | { type: "discovery"; profile: PeopleRec; artworks: ArtworkWithLikes[] };

function buildFeedItems(
  entries: FeedEntry[],
  discoveryData: { profile: PeopleRec; artworks: ArtworkWithLikes[] }[]
): FeedItem[] {
  const items: FeedItem[] = [];
  let entryIdx = 0;
  let recIdx = 0;
  let sinceLastRec = 0;

  while (entryIdx < entries.length || recIdx < discoveryData.length) {
    while (entryIdx < entries.length && sinceLastRec < INTERLEAVE_EVERY) {
      const e = entries[entryIdx];
      if (e.type === "artwork") items.push({ type: "artwork", artwork: e.artwork });
      else items.push({ type: "exhibition", exhibition: e.exhibition });
      entryIdx++;
      sinceLastRec++;
    }
    sinceLastRec = 0;

    if (recIdx < discoveryData.length) {
      const d = discoveryData[recIdx];
      if (d.artworks.length > 0) {
        items.push({ type: "discovery", profile: d.profile, artworks: d.artworks });
      }
      recIdx++;
    }
  }

  return items;
}

type Props = {
  tab: "all" | "following";
  sort?: "latest" | "popular";
  userId: string | null;
};

export function FeedContent({ tab, sort = "latest", userId }: Props) {
  const pathname = usePathname();
  const { t } = useT();
  const [feedEntries, setFeedEntries] = useState<FeedEntry[]>([]);
  const [discoveryData, setDiscoveryData] = useState<
    { profile: PeopleRec; artworks: ArtworkWithLikes[] }[]
  >([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followingProfileIds, setFollowingProfileIds] = useState<string[]>([]);
  const recCacheRef = useRef<{
    profiles: PeopleRec[];
    fetchedAt: number;
  } | null>(null);
  const [artworksNextCursor, setArtworksNextCursor] = useState<ArtworkCursor | null>(null);
  const [exhibitionsNextCursor, setExhibitionsNextCursor] = useState<ExhibitionCursor | null>(null);
  const [followingArtCursor, setFollowingArtCursor] = useState<ArtworkCursor | null>(null);
  const [followingExhCursor, setFollowingExhCursor] = useState<ExhibitionCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const lastFullFetchRef = useRef(0);
  const dataLoadStartedRef = useRef(0);

  const fetchRecProfiles = useCallback(async (): Promise<PeopleRec[]> => {
    const now = Date.now();
    if (
      recCacheRef.current &&
      now - recCacheRef.current.fetchedAt < REC_CACHE_TTL_MS
    ) {
      return recCacheRef.current.profiles;
    }
    if (!userId) return [];
    const [likesRes, followRes] = await Promise.all([
      getPeopleRecs({ mode: "likes_based", limit: 10 }),
      getPeopleRecs({ mode: "follow_graph", limit: 10 }),
    ]);
    const seen = new Set<string>();
    const strong: PeopleRec[] = [];
    const add = (p: PeopleRec) => {
      if (seen.has(p.id) || p.id === userId) return;
      const mut = p.mutual_follow_sources ?? 0;
      const liked = p.liked_artists_count ?? 0;
      const tags = p.reason_tags ?? [];
      const isStrong =
        (tags.includes("follow_graph") && mut >= STRONG_SCORE_THRESHOLD) ||
        (tags.includes("likes_based") && liked >= STRONG_SCORE_THRESHOLD);
      if (isStrong) {
        seen.add(p.id);
        strong.push(p);
      }
    };
    (likesRes.data ?? []).forEach(add);
    (followRes.data ?? []).forEach(add);
    recCacheRef.current = { profiles: strong, fetchedAt: now };
    return strong;
  }, [userId]);

  const fetchArtworks = useCallback(
    async (opts?: { force?: boolean; source?: string }) => {
      const force = opts?.force === true;
      const source = opts?.source ?? (force ? "manual" : "ttl");
      if (userId == null && tab === "following") {
        setLoading(false);
        setFeedEntries([]);
        setDiscoveryData([]);
        return;
      }

      if (!force) {
        const now = Date.now();
        const age = now - lastFullFetchRef.current;
        if (age < FEED_BG_REFRESH_TTL_MS && lastFullFetchRef.current > 0) {
          if (process.env.NODE_ENV === "development") {
            console.debug(`[Feed] TTL skip (${source}): ${Math.round(age / 1000)}s < ${FEED_BG_REFRESH_TTL_MS / 1000}s`);
          }
          return;
        }
      }
      if (process.env.NODE_ENV === "development") {
        console.debug(`[Feed] fetch (${source}), force=${force}`);
      }
      lastFullFetchRef.current = Date.now();
      dataLoadStartedRef.current = performance.now();
      markFeedPerf("feed_fetch_started");

      setLoading(true);
      setError(null);
      setArtworksNextCursor(null);
      setExhibitionsNextCursor(null);
      setFollowingArtCursor(null);
      setFollowingExhCursor(null);

      if (tab === "following") {
        const followingRes = await getFollowingIds();
        const followingSet = followingRes.data ?? new Set<string>();
        const ids = Array.from(followingSet);
        setFollowingIds(followingSet);
        setFollowingProfileIds(ids);

        const [artworksRes, exhibitionsRes] = await Promise.all([
          listFollowingArtworks({ limit: 30, mergeOwnClaimedWorks: true, followingIds: ids }),
          ids.length > 0
            ? listExhibitionsForFollowingFeed(ids, { limit: 12 })
            : Promise.resolve({
                data: [] as ExhibitionWithCredits[],
                nextCursor: null as ExhibitionCursor | null,
                error: null,
              }),
        ]);

        const list = artworksRes.data ?? [];
        if (artworksRes.error) {
          setError(String((artworksRes.error as { message?: string })?.message ?? artworksRes.error));
          setLoading(false);
          return;
        }
        setFollowingArtCursor(artworksRes.nextCursor ?? null);
        setFollowingExhCursor(exhibitionsRes.nextCursor ?? null);

        const exhibitions = exhibitionsRes.data ?? [];
        const entries: FeedEntry[] = [
          ...list.map((a) => ({ type: "artwork" as const, created_at: a.created_at ?? null, artwork: a })),
          ...exhibitions.map((e) => ({ type: "exhibition" as const, created_at: e.created_at ?? null, exhibition: e })),
        ].sort((a, b) => {
          const ta = new Date(a.created_at ?? 0).getTime();
          const tb = new Date(b.created_at ?? 0).getTime();
          return tb - ta;
        });
        setFeedEntries(entries);
        const allIds = list.map((a) => a.id);
        const liked = await getLikedArtworkIds(allIds);
        setLikedIds(liked);

        const elapsed = Math.round(performance.now() - dataLoadStartedRef.current);
        void logBetaEvent("feed_loaded", { tab, sort, duration_ms: elapsed, source, item_count: entries.length });
        markFeedPerf("feed_data_loaded_ms", String(elapsed));

        const recProfiles = await fetchRecProfiles();
        const discoveryPromises = recProfiles.slice(0, DISCOVERY_BLOCKS_MAX).map((p) =>
          listPublicArtworksForProfile(p.id, { limit: 3 }).then(({ data: arts }) =>
            (arts ?? []).length > 0 ? { profile: p, artworks: arts ?? [] } : null
          )
        );
        const discoveryResults = await Promise.all(discoveryPromises);
        const discoveryWithArtworks = discoveryResults.filter(
          (r): r is { profile: PeopleRec; artworks: ArtworkWithLikes[] } => r != null
        );
        setDiscoveryData(discoveryWithArtworks);
        setLoading(false);
        return;
      }

      const [artworksRes, followingRes, exhibitionsRes] = await Promise.all([
        listPublicArtworks({ limit: 30, sort }),
        getFollowingIds(),
        listPublicExhibitionsForFeed(20),
      ]);
      const followingSet = followingRes.data ?? new Set<string>();
      setFollowingIds(followingSet);

      const list = artworksRes.data ?? [];
      const err = artworksRes.error;
      if (err) {
        setError(
          (err as { message?: string })?.message ?? (typeof err === "string" ? err : JSON.stringify(err))
        );
        setLoading(false);
        return;
      }

      setArtworksNextCursor(artworksRes.nextCursor ?? null);
      setExhibitionsNextCursor(exhibitionsRes.nextCursor ?? null);

      const exhibitions = exhibitionsRes.data ?? [];
      const entries: FeedEntry[] = [
        ...list.map((a) => ({ type: "artwork" as const, created_at: a.created_at ?? null, artwork: a })),
        ...exhibitions.map((e) => ({ type: "exhibition" as const, created_at: e.created_at ?? null, exhibition: e })),
      ].sort((a, b) => {
        const ta = new Date(a.created_at ?? 0).getTime();
        const tb = new Date(b.created_at ?? 0).getTime();
        return tb - ta;
      });
      setFeedEntries(entries);

      const allIds = list.map((a) => a.id);
      const liked = await getLikedArtworkIds(allIds);
      setLikedIds(liked);

      const elapsed = Math.round(performance.now() - dataLoadStartedRef.current);
      void logBetaEvent("feed_loaded", { tab, sort, duration_ms: elapsed, source, item_count: entries.length });
      markFeedPerf("feed_data_loaded_ms", String(elapsed));

      const recProfiles = await fetchRecProfiles();
      const discoveryPromises = recProfiles.slice(0, DISCOVERY_BLOCKS_MAX).map((p) =>
        listPublicArtworksForProfile(p.id, { limit: 3 }).then(({ data: arts }) =>
          (arts ?? []).length > 0 ? { profile: p, artworks: arts ?? [] } : null
        )
      );
      const discoveryResults = await Promise.all(discoveryPromises);
      const discoveryWithArtworks = discoveryResults.filter(
        (r): r is { profile: PeopleRec; artworks: ArtworkWithLikes[] } => r != null
      );
      setDiscoveryData(discoveryWithArtworks);
      setLoading(false);
    },
    [tab, sort, userId, fetchRecProfiles]
  );

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;

    if (tab === "following") {
      const artCur = followingArtCursor;
      const exhCur = followingExhCursor;
      const ids = followingProfileIds;
      if (!artCur && !exhCur) return;
      if (exhCur && ids.length === 0) return;

      loadingMoreRef.current = true;
      setLoadingMore(true);
      const t0 = performance.now();
      try {
        const [artworksRes, exhibitionsRes] = await Promise.all([
          artCur
            ? listFollowingArtworks({
                limit: 30,
                cursor: artCur,
                mergeOwnClaimedWorks: false,
              })
            : Promise.resolve({
                data: [] as ArtworkWithLikes[],
                nextCursor: null as ArtworkCursor | null,
                error: null,
              }),
          exhCur && ids.length > 0
            ? listExhibitionsForFollowingFeed(ids, { limit: 12, cursor: exhCur })
            : Promise.resolve({
                data: [] as ExhibitionWithCredits[],
                nextCursor: null as ExhibitionCursor | null,
                error: null,
              }),
        ]);

        setFollowingArtCursor(artworksRes.nextCursor ?? null);
        setFollowingExhCursor(exhibitionsRes.nextCursor ?? null);

        const newArtworks = artworksRes.data ?? [];
        const newExhibitions = exhibitionsRes.data ?? [];
        if (newArtworks.length > 0) {
          const newIds = newArtworks.map((a) => a.id);
          const liked = await getLikedArtworkIds(newIds);
          setLikedIds((prev) => {
            const next = new Set(prev);
            liked.forEach((id) => next.add(id));
            return next;
          });
        }

        const newEntries: FeedEntry[] = [
          ...newArtworks.map((a) => ({ type: "artwork" as const, created_at: a.created_at ?? null, artwork: a })),
          ...newExhibitions.map((e) => ({
            type: "exhibition" as const,
            created_at: e.created_at ?? null,
            exhibition: e,
          })),
        ];
        if (newEntries.length > 0) {
          setFeedEntries((prev) => {
            const merged = [...prev, ...newEntries].sort((a, b) => {
              const ta = new Date(a.created_at ?? 0).getTime();
              const tb = new Date(b.created_at ?? 0).getTime();
              return tb - ta;
            });
            return merged;
          });
        }
        const ms = Math.round(performance.now() - t0);
        void logBetaEvent("feed_load_more", { tab, duration_ms: ms, item_count: newEntries.length, source: "load_more" });
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
      return;
    }

    if (tab !== "all") return;
    const hasMore = artworksNextCursor || exhibitionsNextCursor;
    if (!hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const t0 = performance.now();
    try {
      const [artworksRes, exhibitionsRes] = await Promise.all([
        artworksNextCursor
          ? listPublicArtworks({ limit: 30, sort, cursor: artworksNextCursor })
          : Promise.resolve({ data: [] as ArtworkWithLikes[], nextCursor: null as ArtworkCursor | null, error: null }),
        exhibitionsNextCursor
          ? listPublicExhibitionsForFeed(20, exhibitionsNextCursor)
          : Promise.resolve({
              data: [] as ExhibitionWithCredits[],
              nextCursor: null as ExhibitionCursor | null,
              error: null,
            }),
      ]);
      setArtworksNextCursor(artworksRes.nextCursor ?? null);
      setExhibitionsNextCursor(exhibitionsRes.nextCursor ?? null);

      const newArtworks = artworksRes.data ?? [];
      const newExhibitions = exhibitionsRes.data ?? [];
      if (newArtworks.length > 0) {
        const newIds = newArtworks.map((a) => a.id);
        const liked = await getLikedArtworkIds(newIds);
        setLikedIds((prev) => {
          const next = new Set(prev);
          liked.forEach((id) => next.add(id));
          return next;
        });
      }

      const newEntries: FeedEntry[] = [
        ...newArtworks.map((a) => ({ type: "artwork" as const, created_at: a.created_at ?? null, artwork: a })),
        ...newExhibitions.map((e) => ({ type: "exhibition" as const, created_at: e.created_at ?? null, exhibition: e })),
      ];
      if (newEntries.length > 0) {
        setFeedEntries((prev) => {
          const merged = [...prev, ...newEntries].sort((a, b) => {
            const ta = new Date(a.created_at ?? 0).getTime();
            const tb = new Date(b.created_at ?? 0).getTime();
            return tb - ta;
          });
          return merged;
        });
      }
      const ms = Math.round(performance.now() - t0);
      void logBetaEvent("feed_load_more", { tab, sort, duration_ms: ms, item_count: newEntries.length, source: "load_more" });
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [
    tab,
    sort,
    followingArtCursor,
    followingExhCursor,
    followingProfileIds,
    artworksNextCursor,
    exhibitionsNextCursor,
  ]);

  const hasMoreFollowing = tab === "following" && (followingArtCursor != null || followingExhCursor != null);
  const hasMoreAll = tab === "all" && (artworksNextCursor != null || exhibitionsNextCursor != null);
  const hasMore = hasMoreFollowing || hasMoreAll;

  useEffect(() => {
    if (!hasMore) return;

    const el = loadMoreSentinelRef.current;
    let obs: IntersectionObserver | null = null;

    if (el) {
      obs = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && !loadingMoreRef.current) void loadMore();
        },
        { root: null, rootMargin: "400px", threshold: 0 }
      );
      obs.observe(el);
    }

    return () => {
      obs?.disconnect();
    };
  }, [hasMore, loadMore]);

  useEffect(() => {
    void fetchArtworks({ force: true, source: "initial" });
  }, [tab, sort, userId, fetchArtworks]);

  useEffect(() => {
    if (!pathname?.startsWith("/feed")) return;
    void fetchArtworks({ source: "pathname" });
  }, [pathname, fetchArtworks]);

  useEffect(() => {
    function onFocus() {
      void fetchArtworks({ source: "focus" });
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") void fetchArtworks({ source: "visibility" });
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchArtworks]);

  useEffect(() => {
    if (loading) return;
    const firstPaint = readFeedPerf("feed_first_paint");
    if (firstPaint == null) {
      markFeedPerf("feed_first_paint");
      void logBetaEvent("feed_first_paint", { tab, sort, data_ms: readFeedPerf("feed_data_loaded_ms"), item_count: feedEntries.length, source: "initial" });
    }
  }, [loading, tab, sort, feedEntries.length]);

  const handleLikeUpdate = useCallback(
    (artworkId: string, liked: boolean, count: number) => {
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (liked) next.add(artworkId);
        else next.delete(artworkId);
        return next;
      });
      setFeedEntries((prev) =>
        prev.map((e) =>
          e.type === "artwork" && e.artwork.id === artworkId
            ? { ...e, artwork: { ...e.artwork, likes_count: count } }
            : e
        )
      );
      setDiscoveryData((prev) =>
        prev.map((d) => ({
          ...d,
          artworks: d.artworks.map((a) =>
            a.id === artworkId ? { ...a, likes_count: count } : a
          ),
        }))
      );
    },
    []
  );

  const handleManualRefresh = useCallback(() => {
    void fetchArtworks({ force: true, source: "manual" });
  }, [fetchArtworks]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:gap-5">
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="min-h-[200px] animate-pulse rounded-lg bg-zinc-200 sm:min-h-[240px]"
            aria-hidden
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-600">{String(error)}</p>
      </div>
    );
  }

  const isEmpty = feedEntries.length === 0 && discoveryData.length === 0;
  const isFollowingEmpty = tab === "following" && isEmpty;

  const feedItems = buildFeedItems(feedEntries, discoveryData);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={handleManualRefresh}
          className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
        >
          {t("common.refresh")}
        </button>
      </div>
      {isFollowingEmpty ? (
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <p className="text-zinc-600">{t("feed.followingEmptyTitle")}</p>
          <Link
            href="/people"
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {t("feed.followingEmptyCta")}
          </Link>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <p className="text-zinc-600">{t("feed.noArtworks")}</p>
          {tab === "all" && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/upload"
                className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                {t("feed.emptyAllCtaUpload")}
              </Link>
              <Link
                href="/people"
                className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {t("feed.emptyAllCtaPeople")}
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:gap-5">
          {feedItems.map((item, idx) => {
            if (item.type === "artwork") {
              const isPriority = idx < 2;
              return (
                <div key={`art-${item.artwork.id}`} className="min-w-0">
                  <FeedArtworkCard
                    artwork={item.artwork}
                    likedIds={likedIds}
                    userId={userId}
                    onLikeUpdate={handleLikeUpdate}
                    priority={isPriority}
                  />
                </div>
              );
            }
            if (item.type === "exhibition") {
              return (
                <div
                  key={`exhibition-${item.exhibition.id}`}
                  className="col-span-full min-w-0 lg:col-span-2"
                >
                  <FeedExhibitionCard exhibition={item.exhibition} />
                </div>
              );
            }
            return (
              <FeedDiscoveryBlock
                key={`discovery-${item.profile.id}-${idx}`}
                profile={item.profile}
                artworks={item.artworks}
                likedIds={likedIds}
                initialFollowing={followingIds.has(item.profile.id)}
                userId={userId}
                onLikeUpdate={handleLikeUpdate}
              />
            );
          })}
        </div>
      )}
      {hasMore && (
        <div
          ref={loadMoreSentinelRef}
          className="flex min-h-[80px] items-center justify-center py-4"
          aria-hidden
        >
          {loadingMore && (
            <span className="text-sm text-zinc-500">{t("common.loading") || "Loading…"}</span>
          )}
        </div>
      )}
    </div>
  );
}
