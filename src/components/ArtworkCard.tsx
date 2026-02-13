"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Artwork, getStorageUrl } from "@/lib/supabase/artworks";
import { LikeButton } from "./LikeButton";

type Props = {
  artwork: Artwork;
  likesCount?: number;
  isLiked?: boolean;
  onLikeUpdate?: (artworkId: string, liked: boolean, count: number) => void;
};

function getPriceDisplay(artwork: Artwork): string {
  if (artwork.pricing_mode === "inquire") return "Price upon request";
  if (artwork.is_price_public && artwork.price_usd != null) {
    return `$${Number(artwork.price_usd).toLocaleString()} USD`;
  }
  return "Price hidden";
}

export function ArtworkCard({ artwork, likesCount = 0, isLiked = false, onLikeUpdate }: Props) {
  const router = useRouter();
  const images = artwork.artwork_images ?? [];
  const sortedImages = [...images].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const firstImage = sortedImages[0];
  const imageUrl = firstImage ? getStorageUrl(firstImage.storage_path) : null;
  const artist = artwork.profiles;
  const username = artist?.username ?? "";

  function handleArticleClick() {
    router.push(`/artwork/${artwork.id}`);
  }

  function handleArticleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleArticleClick();
    }
  }

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={handleArticleClick}
      onKeyDown={handleArticleKeyDown}
      className="cursor-pointer overflow-hidden rounded-lg border border-zinc-200 bg-white transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-400"
    >
      <div className="aspect-square w-full bg-zinc-100">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={artwork.title ?? "Artwork"}
              width={400}
              height={400}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-400">
              No image
            </div>
          )}
      </div>
      <div className="p-4">
          <h3 className="font-semibold text-zinc-900">
            {artwork.title ?? "Untitled"}
          </h3>
          <p className="text-sm text-zinc-600">
            {[artwork.year, artwork.medium].filter(Boolean).join(" · ")}
          </p>
          {artwork.ownership_status && (
            <p className="mt-1 text-sm font-medium text-zinc-700">
              {artwork.ownership_status}
            </p>
          )}
          <p className="mt-1 text-sm text-zinc-600">
            {getPriceDisplay(artwork)}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            {username ? (
              <Link
                href={`/u/${username}`}
                onClick={(e) => e.stopPropagation()}
                className="text-sm text-zinc-500 hover:text-zinc-900"
              >
                @{username}
              </Link>
            ) : (
              <span />
            )}
            <LikeButton
              artworkId={artwork.id}
              likesCount={likesCount}
              isLiked={isLiked}
              onUpdate={(newLiked, newCount) =>
                onLikeUpdate?.(artwork.id, newLiked, newCount)
              }
              size="sm"
            />
          </div>
      </div>
    </article>
  );
}
