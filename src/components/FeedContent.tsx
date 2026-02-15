"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/useT";
import {
  type ArtworkWithLikes,
  listFollowingArtworks,
  listPublicArtworks,
} from "@/lib/supabase/artworks";
import { getFollowingIds } from "@/lib/supabase/artists";
import { getLikedArtworkIds } from "@/lib/supabase/likes";
import {
  ArtistThreadCard,
  type ArtistThreadArtist,
} from "./ArtistThreadCard";

const WORKS_PER_THREAD = 6;

type ThreadGroup = {
  artist: ArtistThreadArtist;
  artworks: ArtworkWithLikes[];
};

type Props = {
  tab: "all" | "following";
  sort?: "latest" | "popular";
};

export function FeedContent({ tab, sort = "latest" }: Props) {
  const { t } = useT();
  const [threads, setThreads] = useState<ThreadGroup[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArtworks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [artworksRes, followingRes] = await Promise.all([
      tab === "following"
        ? listFollowingArtworks({ limit: 50 })
        : listPublicArtworks({ limit: 50, sort: "latest" }),
      getFollowingIds(),
    ]);
    const { data: listRaw, error: err } = artworksRes;
    setLoading(false);
    if (err) {
      const msg =
        (err as { message?: string })?.message ??
        (err as { error?: { message?: string } })?.error?.message ??
        (typeof err === "string" ? err : JSON.stringify(err));
      setError(msg);
      return;
    }
    setFollowingIds(followingRes.data ?? new Set());

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

    // Group by artist_id (preserve order)
    const byArtist = new Map<string, ArtworkWithLikes[]>();
    for (const a of list) {
      const key = a.artist_id;
      if (!byArtist.has(key)) byArtist.set(key, []);
      byArtist.get(key)!.push(a);
    }

    const groups: ThreadGroup[] = [];
    for (const [artistId, arts] of byArtist) {
      const first = arts[0];
      const profile = first?.profiles;
      const artist: ArtistThreadArtist = {
        id: artistId,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        bio: profile?.bio ?? null,
        roles: profile?.roles ?? null,
      };
      groups.push({
        artist,
        artworks: arts.slice(0, WORKS_PER_THREAD),
      });
    }

    setThreads(groups);
    const allIds = list.map((a) => a.id);
    const liked = await getLikedArtworkIds(allIds);
    setLikedIds(liked);
  }, [tab, sort]);

  useEffect(() => {
    fetchArtworks();
  }, [fetchArtworks]);

  useEffect(() => {
    function onFocus() {
      fetchArtworks();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchArtworks]);

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

  const isEmpty = threads.length === 0;
  const isFollowingEmpty = tab === "following" && isEmpty;

  const handleLikeUpdate = useCallback(
    (artworkId: string, liked: boolean, count: number) => {
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (liked) next.add(artworkId);
        else next.delete(artworkId);
        return next;
      });
      setThreads((prev) =>
        prev.map((t) => ({
          ...t,
          artworks: t.artworks.map((a) =>
            a.id === artworkId ? { ...a, likes_count: count } : a
          ),
        }))
      );
    },
    []
  );

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
          <p className="text-zinc-600">
            {t("feed.followingEmptyTitle")}
          </p>
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
      )}
    </div>
  );
}
