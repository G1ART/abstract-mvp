"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  type ArtworkWithLikes,
  listFollowingArtworks,
  listPublicArtworks,
} from "@/lib/supabase/artworks";
import { getLikedArtworkIds } from "@/lib/supabase/likes";
import { ArtworkCard } from "./ArtworkCard";

type Props = {
  tab: "all" | "following";
  sort?: "latest" | "popular";
};

export function FeedContent({ tab, sort = "latest" }: Props) {
  const [artworks, setArtworks] = useState<ArtworkWithLikes[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArtworks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } =
      tab === "following"
        ? await listFollowingArtworks({ limit: 50 })
        : await listPublicArtworks({ limit: 50, sort: "latest" });
    setLoading(false);
    if (err) {
      const msg =
        (err as { message?: string })?.message ??
        (err as { error?: { message?: string } })?.error?.message ??
        (typeof err === "string" ? err : JSON.stringify(err));
      setError(msg);
      return;
    }
    let list = data ?? [];
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
    const ids = list.map((a) => a.id);
    const liked = await getLikedArtworkIds(ids);
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
        <p className="text-zinc-600">Loading...</p>
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

  const isEmpty = artworks.length === 0;
  const isFollowingEmpty = tab === "following" && isEmpty;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={fetchArtworks}
          className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
        >
          Refresh
        </button>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {isFollowingEmpty ? (
          <div className="col-span-full flex flex-col items-center justify-center gap-4 py-12 text-center">
            <p className="text-zinc-600">
              Follow artists to personalize your feed.
            </p>
            <Link
              href="/artists"
              className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Find artists
            </Link>
          </div>
        ) : isEmpty ? (
          <p className="col-span-full py-12 text-center text-zinc-600">
            No artworks yet
          </p>
        ) : (
          artworks.map((artwork) => (
            <ArtworkCard
              key={artwork.id}
              artwork={artwork}
              likesCount={Number(artwork.likes_count) || 0}
              isLiked={likedIds.has(artwork.id)}
              onLikeUpdate={(id, liked, count) => {
                setLikedIds((prev) => {
                  const next = new Set(prev);
                  if (liked) next.add(id);
                  else next.delete(id);
                  return next;
                });
                setArtworks((prev) =>
                  prev.map((a) =>
                    a.id === id ? { ...a, likes_count: count } : a
                  )
                );
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
