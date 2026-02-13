"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { getSession } from "@/lib/supabase/auth";
import {
  type ArtworkWithLikes,
  getArtworkById,
  getStorageUrl,
  recordArtworkView,
} from "@/lib/supabase/artworks";
import { isLiked } from "@/lib/supabase/likes";
import { isFollowing } from "@/lib/supabase/follows";
import { FollowButton } from "@/components/FollowButton";
import { LikeButton } from "@/components/LikeButton";

function getPriceDisplay(artwork: ArtworkWithLikes): string {
  if (artwork.pricing_mode === "inquire") return "Price upon request";
  if (artwork.is_price_public && artwork.price_usd != null) {
    return `$${Number(artwork.price_usd).toLocaleString()} USD`;
  }
  return "Price hidden";
}

function ArtworkDetailContent() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [artwork, setArtwork] = useState<ArtworkWithLikes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const VIEW_TTL_MS = 10 * 60 * 1000; // 10 minutes

  const recordView = useCallback(async () => {
    if (!id || typeof window === "undefined") return;
    const key = `viewed_artwork_${id}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const ts = parseInt(raw, 10);
      if (!isNaN(ts) && Date.now() - ts < VIEW_TTL_MS) return;
    }
    await recordArtworkView(id);
    localStorage.setItem(key, Date.now().toString());
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getArtworkById(id).then(({ data, error: err }) => {
      setLoading(false);
      if (err) {
        const msg =
          (err as { message?: string })?.message ??
          (err as { error?: { message?: string } })?.error?.message ??
          (typeof err === "string" ? err : JSON.stringify(err));
        setError(msg);
        return;
      }
      setArtwork(data as ArtworkWithLikes | null);
    });
  }, [id]);

  useEffect(() => {
    getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (artwork?.artist_id && userId && userId !== artwork.artist_id) {
      isFollowing(artwork.artist_id).then(({ data }) => setFollowing(data ?? false));
    }
  }, [artwork?.artist_id, userId]);

  useEffect(() => {
    if (id && userId) {
      isLiked(id).then(setLiked);
    }
  }, [id, userId]);

  useEffect(() => {
    if (artwork && userId) {
      recordView();
    }
  }, [artwork, userId, recordView]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <p className="text-zinc-600">Loading...</p>
      </div>
    );
  }

  if (error || !artwork) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-600">{error ? String(error) : "Artwork not found"}</p>
      </div>
    );
  }

  const images = artwork.artwork_images ?? [];
  const sortedImages = [...images].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const artist = artwork.profiles;
  const username = artist?.username ?? "";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/feed?tab=all&sort=latest"
        className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900"
      >
        ← Back to feed
      </Link>
      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="aspect-square w-full overflow-hidden rounded-lg bg-zinc-100">
            {sortedImages.length > 0 ? (
              <Image
                src={getStorageUrl(sortedImages[0].storage_path)}
                alt={artwork.title ?? "Artwork"}
                width={600}
                height={600}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-400">
                No image
              </div>
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">
              {artwork.title ?? "Untitled"}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              {[artwork.year, artwork.medium].filter(Boolean).join(" · ")}
            </p>
            {artwork.ownership_status && (
              <p className="mt-2 font-medium text-zinc-700">
                {artwork.ownership_status}
              </p>
            )}
            <p className="mt-2 text-sm text-zinc-600">
              {getPriceDisplay(artwork)}
            </p>
            <div className="mt-2">
              <LikeButton
                artworkId={artwork.id}
                likesCount={Number(artwork.likes_count) || 0}
                isLiked={liked}
                onUpdate={(newLiked, newCount) => {
                  setLiked(newLiked);
                  setArtwork((prev) =>
                    prev ? { ...prev, likes_count: newCount } : null
                  );
                }}
                showLoginCta={!userId}
              />
            </div>
            {username && (
              <div className="mt-4 flex items-center gap-3">
                <Link
                  href={`/u/${username}`}
                  className="text-sm font-medium text-zinc-700 hover:text-zinc-900"
                >
                  @{username}
                  {artist?.display_name && ` (${artist.display_name})`}
                </Link>
                {userId && userId !== artwork.artist_id && (
                  <FollowButton
                    targetProfileId={artwork.artist_id}
                    initialFollowing={following}
                    size="sm"
                  />
                )}
              </div>
            )}
          </div>
        </div>
        {artwork.story && (
          <p className="text-sm text-zinc-600">{artwork.story}</p>
        )}
      </div>
    </main>
  );
}

export default function ArtworkDetailPage() {
  return <ArtworkDetailContent />;
}
