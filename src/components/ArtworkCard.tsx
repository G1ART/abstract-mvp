"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Artwork, getStorageUrl } from "@/lib/supabase/artworks";
import { useT } from "@/lib/i18n/useT";
import { LikeButton } from "./LikeButton";

type Props = {
  artwork: Artwork;
  likesCount?: number;
  isLiked?: boolean;
  onLikeUpdate?: (artworkId: string, liked: boolean, count: number) => void;
  showDelete?: boolean;
  onDelete?: (artworkId: string) => void;
  disableNavigation?: boolean;
  dragHandle?: React.ReactNode;
};

function getPriceDisplay(artwork: Artwork): string {
  if (artwork.pricing_mode === "inquire") return "Price upon request";
  if (artwork.is_price_public && artwork.price_usd != null) {
    return `$${Number(artwork.price_usd).toLocaleString()} USD`;
  }
  return "Price hidden";
}

export function ArtworkCard({ artwork, likesCount = 0, isLiked = false, onLikeUpdate, showDelete = false, onDelete, disableNavigation = false, dragHandle }: Props) {
  const router = useRouter();
  const { t } = useT();
  const images = artwork.artwork_images ?? [];
  const sortedImages = [...images].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const firstImage = sortedImages[0];
  const imageUrl = firstImage ? getStorageUrl(firstImage.storage_path) : null;
  const artist = artwork.profiles;
  const username = artist?.username ?? "";

  function handleArticleClick() {
    if (disableNavigation) return;
    router.push(`/artwork/${artwork.id}`);
  }

  function handleArticleKeyDown(e: React.KeyboardEvent) {
    if (disableNavigation) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleArticleClick();
    }
  }

  return (
    <article
      role={disableNavigation ? undefined : "link"}
      tabIndex={disableNavigation ? undefined : 0}
      onClick={handleArticleClick}
      onKeyDown={handleArticleKeyDown}
      className={`overflow-hidden rounded-lg border border-zinc-200 bg-white transition-shadow focus:outline-none focus:ring-2 focus:ring-zinc-400 ${disableNavigation ? "" : "cursor-pointer hover:shadow-md"}`}
    >
      {dragHandle && (
        <div className="flex items-center justify-end border-b border-zinc-100 bg-zinc-50 px-2 py-1" onClick={(e) => e.stopPropagation()}>
          {dragHandle}
        </div>
      )}
      <div className="aspect-square w-full bg-zinc-100">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={artwork.title ?? "Artwork"}
              width={400}
              height={400}
              className="h-full w-full object-contain"
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
            <div className="flex items-center gap-2">
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
              {showDelete && onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (typeof window !== "undefined" && window.confirm(t("common.confirmDeleteShort"))) {
                      onDelete(artwork.id);
                    }
                  }}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  {t("common.delete")}
                </button>
              )}
            </div>
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
