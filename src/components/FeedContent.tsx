"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/useT";
import { logBetaEvent } from "@/lib/beta/logEvent";
import { markFeedPerf, readFeedPerf } from "@/lib/feed/feedPerf";
import {
  buildLivingSalonItems,
  summarizeFirstView,
  summarizeLivingSalonMix,
} from "@/lib/feed/livingSalon";
import type { DiscoveryDatum, FeedEntry } from "@/lib/feed/types";
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
import {
  getPeopleRecommendations,
  type PeopleRec,
} from "@/lib/supabase/recommendations";
import { FeedHeader } from "./feed/FeedHeader";
import { LivingSalonGrid } from "./feed/LivingSalonGrid";

const REC_CACHE_TTL_MS = 3 * 60 * 1000;
const FEED_BG_REFRESH_TTL_MS = 90_000;
const STRONG_SCORE_THRESHOLD = 2;
const DISCOVERY_BLOCKS_MAX = 4;
const FEED_LAYOUT_VERSION = "living_salon_v1.1_editorial";

function deduplicateAndSort(entries: FeedEntry[]): FeedEntry[] {
  const seen = new Set<string>();
  const unique = entries.filter((e) => {
    const id = e.type === "artwork" ? `a:${e.artwork.id}` : `e:${e.exhibition.id}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return unique.sort((a, b) => {
    const ta = new Date(a.created_at ?? 0).getTime();
    const tb = new Date(b.created_at ?? 0).getTime();
    return tb - ta;
  });
}

type Props = {
  tab: "all" | "following";
  sort?: "latest" | "popular";
  userId: string | null;
  onTabChange: (tab: "all" | "following") => void;
  onSortChange: (sort: "latest" | "popular") => void;
};

export function FeedContent({
  tab,
  sort = "latest",
  userId,
  onTabChange,
  onSortChange,
}: Props) {
  const pathname = usePathname();
  const { t } = useT();
  const [feedEntries, setFeedEntries] = useState<FeedEntry[]>([]);
  const [discoveryData, setDiscoveryData] = useState<DiscoveryDatum[]>([]);
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
      getPeopleRecommendations({ lane: "likes_based", limit: 10 }),
      getPeopleRecommendations({ lane: "follow_graph", limit: 10 }),
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
          setError(t("feed.errorTitle"));
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
        void logBetaEvent("feed_loaded", {
          tab,
          sort,
          duration_ms: elapsed,
          source,
          item_count: entries.length,
          layout_version: FEED_LAYOUT_VERSION,
        });
        markFeedPerf("feed_data_loaded_ms", String(elapsed));

        const recProfiles = await fetchRecProfiles();
        const discoveryPromises = recProfiles.slice(0, DISCOVERY_BLOCKS_MAX).map((p) =>
          listPublicArtworksForProfile(p.id, { limit: 3 }).then(({ data: arts }) =>
            (arts ?? []).length > 0 ? { profile: p, artworks: arts ?? [] } : null
          )
        );
        const discoveryResults = await Promise.all(discoveryPromises);
        const discoveryWithArtworks = discoveryResults.filter(
          (r): r is DiscoveryDatum => r != null
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
        setError(t("feed.errorTitle"));
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
      void logBetaEvent("feed_loaded", {
        tab,
        sort,
        duration_ms: elapsed,
        source,
        item_count: entries.length,
        layout_version: FEED_LAYOUT_VERSION,
      });
      markFeedPerf("feed_data_loaded_ms", String(elapsed));

      const recProfiles = await fetchRecProfiles();
      const discoveryPromises = recProfiles.slice(0, DISCOVERY_BLOCKS_MAX).map((p) =>
        listPublicArtworksForProfile(p.id, { limit: 3 }).then(({ data: arts }) =>
          (arts ?? []).length > 0 ? { profile: p, artworks: arts ?? [] } : null
        )
      );
      const discoveryResults = await Promise.all(discoveryPromises);
      const discoveryWithArtworks = discoveryResults.filter(
        (r): r is DiscoveryDatum => r != null
      );
      setDiscoveryData(discoveryWithArtworks);
      setLoading(false);
    },
    [tab, sort, userId, fetchRecProfiles, t]
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
          setFeedEntries((prev) => deduplicateAndSort([...prev, ...newEntries]));
        }
        const ms = Math.round(performance.now() - t0);
        void logBetaEvent("feed_load_more", {
          tab,
          duration_ms: ms,
          item_count: newEntries.length,
          source: "load_more",
          layout_version: FEED_LAYOUT_VERSION,
        });
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
      return;
    }

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
        setFeedEntries((prev) => deduplicateAndSort([...prev, ...newEntries]));
      }
      const ms = Math.round(performance.now() - t0);
      void logBetaEvent("feed_load_more", {
        tab,
        sort,
        duration_ms: ms,
        item_count: newEntries.length,
        source: "load_more",
        layout_version: FEED_LAYOUT_VERSION,
      });
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

  const livingSalonItems = useMemo(
    () =>
      buildLivingSalonItems({
        entries: feedEntries,
        discoveryData,
      }),
    [feedEntries, discoveryData]
  );

  useEffect(() => {
    if (loading) return;
    const firstPaint = readFeedPerf("feed_first_paint");
    if (firstPaint == null) {
      markFeedPerf("feed_first_paint");
      const mix = summarizeLivingSalonMix(livingSalonItems);
      const firstView = summarizeFirstView(livingSalonItems);
      void logBetaEvent("feed_first_paint", {
        tab,
        sort,
        data_ms: readFeedPerf("feed_data_loaded_ms"),
        item_count: feedEntries.length,
        source: "initial",
        layout_version: FEED_LAYOUT_VERSION,
        item_mix: {
          artworks: mix.artworks,
          exhibitions: mix.exhibitions,
          artist_worlds: mix.artist_worlds,
        },
        first_view_estimate: firstView,
      });
    }
  }, [loading, tab, sort, feedEntries.length, livingSalonItems]);

  const isEmpty = feedEntries.length === 0 && discoveryData.length === 0;
  const isFollowingEmpty = tab === "following" && isEmpty;

  return (
    <div>
      <FeedHeader
        tab={tab}
        sort={sort}
        isLoading={loading}
        onTabChange={onTabChange}
        onSortChange={onSortChange}
        onRefresh={handleManualRefresh}
      />

      {loading ? (
        <SalonSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="text-sm text-zinc-700">{error}</p>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
          >
            {t("feed.errorRetry")}
          </button>
        </div>
      ) : isFollowingEmpty ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <p className="text-sm text-zinc-600">{t("feed.followingEmptyTitle")}</p>
          <Link
            href="/people"
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {t("feed.followingEmptyCta")}
          </Link>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <p className="text-sm text-zinc-600">{t("feed.noArtworks")}</p>
          {tab === "all" && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/upload"
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                {t("feed.emptyAllCtaUpload")}
              </Link>
              <Link
                href="/people"
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {t("feed.emptyAllCtaPeople")}
              </Link>
            </div>
          )}
        </div>
      ) : (
        <LivingSalonGrid
          items={livingSalonItems}
          likedIds={likedIds}
          followingIds={followingIds}
          userId={userId}
          onLikeUpdate={handleLikeUpdate}
        />
      )}

      {hasMore ? (
        <div
          ref={loadMoreSentinelRef}
          className="flex min-h-[80px] items-center justify-center py-6"
          aria-hidden
        >
          {loadingMore && (
            <span className="text-xs text-zinc-500">{t("feed.loading")}</span>
          )}
        </div>
      ) : feedEntries.length > 0 ? (
        <p className="py-10 text-center text-xs text-zinc-400">
          {t("feed.caughtUp")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Skeleton that mirrors the editorial rhythm: a 2x2 spotlight on lg, a
 * handful of standard tiles, one full-width context strip, and a few more
 * tiles. Tiles use the same 4:5 aspect as the loaded feed so the loading
 * state never looks like a different product. Borderless to match the
 * loaded grid (no rounded card frames).
 */
function SalonSkeleton() {
  return (
    <div className="grid auto-rows-min grid-cols-2 items-start gap-x-6 gap-y-10 [grid-auto-flow:dense] md:grid-cols-3 lg:grid-cols-4">
      <div
        className="col-span-1 aspect-square animate-pulse bg-zinc-100 lg:col-span-2 lg:row-span-2"
        aria-hidden
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={`s-art-top-${i}`}
          className="col-span-1 aspect-[4/5] animate-pulse bg-zinc-100"
          aria-hidden
        />
      ))}
      <div
        className="col-span-2 h-28 animate-pulse bg-zinc-100 md:col-span-3 lg:col-span-4"
        aria-hidden
      />
      {[0, 1, 2, 3].map((i) => (
        <div
          key={`s-art-bot-${i}`}
          className="col-span-1 aspect-[4/5] animate-pulse bg-zinc-100"
          aria-hidden
        />
      ))}
    </div>
  );
}
