"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/useT";
import {
  type ArtworkWithLikes,
  listFollowingArtworks,
  listPublicArtworks,
  listPublicArtworksForProfile,
} from "@/lib/supabase/artworks";
import { getFollowingIds } from "@/lib/supabase/artists";
import { getLikedArtworkIds } from "@/lib/supabase/likes";
import { getPeopleRecs, type PeopleRec } from "@/lib/supabase/peopleRecs";
import { FeedArtworkCard } from "./FeedArtworkCard";
import { FeedDiscoveryBlock } from "./FeedDiscoveryBlock";

const REC_CACHE_TTL_MS = 3 * 60 * 1000; // 3 min
const INTERLEAVE_EVERY = 5; // 5 artworks : 1 discovery block
const STRONG_SCORE_THRESHOLD = 2;
const DISCOVERY_BLOCKS_MAX = 5;

type FeedItem =
  | { type: "artwork"; artwork: ArtworkWithLikes }
  | { type: "discovery"; profile: PeopleRec; artworks: ArtworkWithLikes[] };

function buildFeedItems(
  artworks: ArtworkWithLikes[],
  discoveryData: { profile: PeopleRec; artworks: ArtworkWithLikes[] }[]
): FeedItem[] {
  const items: FeedItem[] = [];
  let artIdx = 0;
  let recIdx = 0;
  let sinceLastRec = 0;

  while (artIdx < artworks.length || recIdx < discoveryData.length) {
    // Insert artwork(s) until we've added 5 since last discovery
    while (artIdx < artworks.length && sinceLastRec < INTERLEAVE_EVERY) {
      items.push({ type: "artwork", artwork: artworks[artIdx] });
      artIdx++;
      sinceLastRec++;
    }
    sinceLastRec = 0;

    // Insert discovery block
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
  const [discoveryData, setDiscoveryData] = useState<
    { profile: PeopleRec; artworks: ArtworkWithLikes[] }[]
  >([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const recCacheRef = useRef<{
    profiles: PeopleRec[];
    fetchedAt: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setLoading(true);
    setError(null);
    const [artworksRes, followingRes] = await Promise.all([
      tab === "following"
        ? listFollowingArtworks({ limit: 80 })
        : listPublicArtworks({ limit: 80, sort }),
      getFollowingIds(),
    ]);
    const { data: listRaw, error: err } = artworksRes;
    setFollowingIds(followingRes.data ?? new Set());

    if (err) {
      const msg =
        (err as { message?: string })?.message ??
        (err as { error?: { message?: string } })?.error?.message ??
        (typeof err === "string" ? err : JSON.stringify(err));
      setError(msg);
      setLoading(false);
      return;
    }

    let list = listRaw ?? [];
    if (sort === "popular") {
      list = [...list].sort((a, b) => {
        const countA = Number(a.likes_count) || 0;
        const countB = Number(b.likes_count) || 0;
        if (countB !== countA) return countB - countA;
        const dateA = new Date(a.created_at ?? 0).getTime();
        const dateB = new Date(b.created_at ?? 0).getTime();
        return dateB - dateA;
      });
    }

    setArtworks(list);

    const allIds = list.map((a) => a.id);
    const liked = await getLikedArtworkIds(allIds);
    setLikedIds(liked);

    // Fetch discovery: rec profiles + their artworks
    const recProfiles = await fetchRecProfiles();
    const discoveryWithArtworks: { profile: PeopleRec; artworks: ArtworkWithLikes[] }[] = [];
    for (const p of recProfiles.slice(0, DISCOVERY_BLOCKS_MAX)) {
      const { data: arts } = await listPublicArtworksForProfile(p.id, {
        limit: 3,
      });
      if ((arts ?? []).length > 0) {
        discoveryWithArtworks.push({ profile: p, artworks: arts ?? [] });
      }
    }
    setDiscoveryData(discoveryWithArtworks);
    setLoading(false);
  }, [tab, sort, userId, fetchRecProfiles]);

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
      <div className="flex justify-center py-12">
        <p className="text-zinc-600">{t("feed.loading")}</p>
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

  const isEmpty = artworks.length === 0 && discoveryData.length === 0;
  const isFollowingEmpty = tab === "following" && isEmpty;

  const feedItems = buildFeedItems(artworks, discoveryData);

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
              return (
                <div key={`art-${item.artwork.id}`} className="min-w-0">
                  <FeedArtworkCard
                    artwork={item.artwork}
                    likedIds={likedIds}
                    userId={userId}
                    onLikeUpdate={handleLikeUpdate}
                  />
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
    </div>
  );
}
