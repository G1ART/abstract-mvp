"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/useT";
import {
  type ArtworkWithLikes,
  type ArtworkCursor,
  listFollowingArtworks,
  listPublicArtworks,
  listPublicArtworksForProfile,
} from "@/lib/supabase/artworks";
import { getFollowingIds } from "@/lib/supabase/artists";
import {
  listExhibitionsForFeed,
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
  const [artworks, setArtworks] = useState<ArtworkWithLikes[]>([]);
  const [feedEntries, setFeedEntries] = useState<FeedEntry[]>([]);
  const [discoveryData, setDiscoveryData] = useState<
    { profile: PeopleRec; artworks: ArtworkWithLikes[] }[]
  >([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const recCacheRef = useRef<{
    profiles: PeopleRec[];
    fetchedAt: number;
  } | null>(null);
  const [artworksNextCursor, setArtworksNextCursor] = useState<ArtworkCursor | null>(null);
  const [exhibitionsNextCursor, setExhibitionsNextCursor] = useState<ExhibitionCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

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

  const fetchArtworks = useCallback(async () => {
    if (userId == null && tab === "following") return;
    setLoading(true);
    setError(null);
    setArtworksNextCursor(null);
    setExhibitionsNextCursor(null);

    if (tab === "following") {
      const [artworksRes, followingRes, exhibitionsRes] = await Promise.all([
        listFollowingArtworks({ limit: 50 }),
        getFollowingIds(),
        getFollowingIds().then((r) =>
          r.data?.size ? listExhibitionsForFeed(Array.from(r.data)) : { data: [] as ExhibitionWithCredits[], error: null }
        ),
      ]);
      const list = artworksRes.data ?? [];
      const followingSet = followingRes.data ?? new Set<string>();
      setFollowingIds(followingSet);
      if (artworksRes.error) {
        setError(String((artworksRes.error as { message?: string })?.message ?? artworksRes.error));
        setLoading(false);
        return;
      }
      setArtworks(list);
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

    setArtworks(list);
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
  }, [tab, sort, userId, fetchRecProfiles]);

  const loadMore = useCallback(async () => {
    if (tab !== "all" || loadingMore) return;
    const hasMore = artworksNextCursor || exhibitionsNextCursor;
    if (!hasMore) return;
    setLoadingMore(true);
    try {
    const [artworksRes, exhibitionsRes] = await Promise.all([
      artworksNextCursor
        ? listPublicArtworks({ limit: 30, sort, cursor: artworksNextCursor })
        : Promise.resolve({ data: [] as ArtworkWithLikes[], nextCursor: null as ArtworkCursor | null, error: null }),
      exhibitionsNextCursor
        ? listPublicExhibitionsForFeed(20, exhibitionsNextCursor)
        : Promise.resolve({ data: [] as ExhibitionWithCredits[], nextCursor: null as ExhibitionCursor | null, error: null }),
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
      setArtworks((prev) => {
        const ids = new Set(prev.map((a) => a.id));
        const added = newArtworks.filter((a) => !ids.has(a.id));
        return added.length > 0 ? [...prev, ...added] : prev;
      });
      setFeedEntries((prev) => {
        const merged = [...prev, ...newEntries].sort((a, b) => {
          const ta = new Date(a.created_at ?? 0).getTime();
          const tb = new Date(b.created_at ?? 0).getTime();
          return tb - ta;
        });
        return merged;
      });
    }
    } finally {
      setLoadingMore(false);
    }
  }, [tab, sort, artworksNextCursor, exhibitionsNextCursor, loadingMore]);

  useEffect(() => {
    const el = loadMoreSentinelRef.current;
    if (!el || tab !== "all") return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore && (artworksNextCursor || exhibitionsNextCursor)) {
          loadMore();
        }
      },
      { rootMargin: "200px", threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab, loadingMore, artworksNextCursor, exhibitionsNextCursor, loadMore]);

  useEffect(() => {
    fetchArtworks();
  }, [fetchArtworks]);

  useEffect(() => {
    if (pathname?.startsWith("/feed")) {
      fetchArtworks();
    }
  }, [pathname, fetchArtworks]);

  useEffect(() => {
    function refresh() {
      fetchArtworks();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") refresh();
    }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", refresh);
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
      setArtworks((prev) =>
        prev.map((a) =>
          a.id === artworkId ? { ...a, likes_count: count } : a
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
          onClick={fetchArtworks}
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
        <p className="py-12 text-center text-zinc-600">{t("feed.noArtworks")}</p>
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
      {tab === "all" && (artworksNextCursor || exhibitionsNextCursor) && (
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
