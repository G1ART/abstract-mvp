"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  type ArtworkWithLikes,
  getArtworkImageUrl,
  getPrimaryClaim,
  canEditArtwork,
} from "@/lib/supabase/artworks";
import type { ClaimType } from "@/lib/provenance/types";
import { claimTypeToLabel } from "@/lib/provenance/rpc";
import { useT } from "@/lib/i18n/useT";
import { LikeButton } from "./LikeButton";
import Link from "next/link";

function getPriceDisplay(artwork: ArtworkWithLikes): string | null {
  if (artwork.pricing_mode === "inquire") return "Price upon request";
  if (artwork.is_price_public && artwork.price_usd != null) {
    return `$${Number(artwork.price_usd).toLocaleString()} USD`;
  }
  return null;
}

type Props = {
  artwork: ArtworkWithLikes;
  likedIds: Set<string>;
  userId?: string | null;
  onLikeUpdate?: (artworkId: string, liked: boolean, count: number) => void;
  priority?: boolean;
};

export function FeedArtworkCard({
  artwork,
  likedIds,
  userId = null,
  onLikeUpdate,
  priority = false,
}: Props) {
  const router = useRouter();
  const { t } = useT();
  const images = artwork.artwork_images ?? [];
  const sorted = [...images].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const first = sorted[0];
  const imageUrl = first ? getArtworkImageUrl(first.storage_path, "thumb") : null;
  const artist = artwork.profiles;
  const username = artist?.username ?? "";
  const displayName = artist?.display_name?.trim() || username || "Artist";
  const primaryClaim = getPrimaryClaim(artwork);
  const claimLabel = primaryClaim
    ? claimTypeToLabel(primaryClaim.claim_type as ClaimType)
    : "Work";
  const priceDisplay = getPriceDisplay(artwork);

  function handleClick() {
    router.push(`/artwork/${artwork.id}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-zinc-400"
    >
      <div className="relative aspect-square w-full bg-zinc-100">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={artwork.title ?? "Artwork"}
            width={400}
            height={400}
            sizes="(max-width: 768px) 50vw, 33vw"
            loading={priority ? "eager" : "lazy"}
            priority={priority}
            className="h-full w-full object-contain transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-400">No image</div>
        )}
        <div
          className="absolute bottom-2 right-2"
          onClick={(e) => e.stopPropagation()}
        >
          {userId && (
            <LikeButton
              artworkId={artwork.id}
              likesCount={artwork.likes_count ?? 0}
              isLiked={likedIds.has(artwork.id)}
              onUpdate={(newLiked, newCount) =>
                onLikeUpdate?.(artwork.id, newLiked, newCount)
              }
              size="sm"
            />
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="truncate font-semibold text-zinc-900">
          {artwork.title ?? "Untitled"}
        </h3>
        <p className="text-xs text-zinc-500">
          {[artwork.year, artwork.medium].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {username ? (
            <Link
              href={`/u/${username}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-zinc-600 hover:text-zinc-900"
            >
              @{username}
            </Link>
          ) : null}
          <span className="text-zinc-400">·</span>
          <span className="text-zinc-500">{claimLabel}</span>
          {(artwork.claims?.length ?? 0) > 1 && (
            <>
              <span className="text-zinc-400">·</span>
              <span className="text-zinc-400" title={t("artwork.viewHistory")}>
                +{(artwork.claims?.length ?? 1) - 1} {t("artwork.moreInHistory")}
              </span>
            </>
          )}
          {priceDisplay && (
            <>
              <span className="text-zinc-400">·</span>
              <span className="font-medium text-zinc-700">{priceDisplay}</span>
            </>
          )}
        </div>
        {userId && canEditArtwork(artwork, userId) && (
          <Link
            href={`/artwork/${artwork.id}/edit`}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 self-start text-xs text-zinc-500 hover:text-zinc-800"
          >
            {t("common.edit")}
          </Link>
        )}
      </div>
    </article>
  );
}
