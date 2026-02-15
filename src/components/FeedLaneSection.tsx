"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/useT";
import type { ArtworkWithLikes } from "@/lib/supabase/artworks";
import { getFollowingIds } from "@/lib/supabase/artists";
import { getLikedArtworkIds } from "@/lib/supabase/likes";
import { ArtistThreadCard, type ArtistThreadArtist } from "./ArtistThreadCard";
import type { LaneResult } from "@/lib/recs/lanes";

const WORKS_PER_THREAD = 6;
const LANE_INITIAL = 15;
const LANE_LOAD_MORE = 10;

type ThreadGroup = {
  artist: ArtistThreadArtist;
  artworks: ArtworkWithLikes[];
};

function listToThreads(list: ArtworkWithLikes[]): ThreadGroup[] {
  const byArtist = new Map<string, ArtworkWithLikes[]>();
  for (const a of list) {
    const key = a.artist_id;
    if (!byArtist.has(key)) byArtist.set(key, []);
    byArtist.get(key)!.push(a);
  }
  const out: ThreadGroup[] = [];
  for (const [artistId, arts] of byArtist) {
    const first = arts[0];
    const profile = first?.profiles;
    out.push({
      artist: {
        id: artistId,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        bio: profile?.bio ?? null,
        roles: profile?.roles ?? null,
      },
      artworks: arts.slice(0, WORKS_PER_THREAD),
    });
  }
  return out;
}

type Props = {
  titleKey: string;
  hintKey: string;
  fetcher: (limit: number) => Promise<LaneResult>;
  userId: string | null;
};

export function FeedLaneSection({ titleKey, hintKey, fetcher, userId }: Props) {
  const { t } = useT();
  const [threads, setThreads] = useState<ThreadGroup[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [limit, setLimit] = useState(LANE_INITIAL);

  const fetchLane = useCallback(
    async () => {
      const isLoadMore = limit > LANE_INITIAL;
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      const res = await fetcher(limit);
      if (res.error) {
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      const list = res.data ?? [];
      setThreads(listToThreads(list));
      setHasMore(!!res.nextCursor);
      if (list.length > 0) {
        const ids = list.map((a) => a.id);
        const liked = await getLikedArtworkIds(ids);
        setLikedIds(liked);
      }
      const following = await getFollowingIds();
      setFollowingIds(following.data ?? new Set());
      setLoading(false);
      setLoadingMore(false);
    },
    [fetcher, limit]
  );

  useEffect(() => {
    fetchLane();
  }, [fetchLane]);

  const handleLoadMore = useCallback(() => {
    setLimit((l) => l + LANE_LOAD_MORE);
  }, []);

  const handleLikeUpdate = useCallback(
    (artworkId: string, liked: boolean, count: number) => {
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (liked) next.add(artworkId);
        else next.delete(artworkId);
        return next;
      });
      setThreads((prev) =>
        prev.map((g) => ({
          ...g,
          artworks: g.artworks.map((a) =>
            a.id === artworkId ? { ...a, likes_count: count } : a
          ),
        }))
      );
    },
    []
  );

  if (loading && threads.length === 0) {
    return (
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900">
          {t(titleKey)}
        </h2>
        <p className="mb-4 text-sm text-zinc-500">{t(hintKey)}</p>
        <p className="py-6 text-center text-zinc-500">{t("feed.loading")}</p>
      </section>
    );
  }

  if (threads.length === 0) {
    return null;
  }

  return (
    <section className="mb-10">
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">
        {t(titleKey)}
      </h2>
      <p className="mb-4 text-sm text-zinc-500">{t(hintKey)}</p>
      <div className="space-y-6">
        {threads.map(({ artist, artworks }) => (
          <ArtistThreadCard
            key={artist.id}
            artist={artist}
            artworks={artworks}
            likedIds={likedIds}
            initialFollowing={followingIds.has(artist.id)}
            onLikeUpdate={handleLikeUpdate}
          />
        ))}
      </div>
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="rounded border border-zinc-300 px-6 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {loadingMore ? t("feed.loading") : t("feed.loadMore")}
          </button>
        </div>
      )}
    </section>
  );
}
