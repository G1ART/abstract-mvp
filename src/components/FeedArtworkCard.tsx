"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { setArtworkBack } from "@/lib/artworkBack";
import {
  type ArtworkWithLikes,
  getArtworkImageUrl,
  getPrimaryClaim,
  canEditArtwork,
} from "@/lib/supabase/artworks";
import { useT } from "@/lib/i18n/useT";
import {
  formatDisplayName,
  formatIdentityPair,
  formatRoleChips,
  hasPublicLinkableUsername,
} from "@/lib/identity/format";
import { LikeButton } from "./LikeButton";

type ArtistProfileLite = {
  id?: string;
  username?: string | null;
  display_name?: string | null;
  main_role?: string | null;
  roles?: string[] | null;
};

/**
 * Card variants used inside the Living Salon grid.
 * - `feedTile`: standard tile in the salon grid.
 * - `feedAnchor`: slightly larger anchor; same content rules as `feedTile`
 *   but image area is given more breathing room. The grid clamps height so
 *   it never dominates the viewport (Work Order §F2).
 * - `discoveryMini`: compact thumb used inside artist-world strips. Title is
 *   shown but everything else is hidden so the strip stays quiet.
 */
export type FeedArtworkCardVariant = "feedTile" | "feedAnchor" | "discoveryMini";

type Props = {
  artwork: ArtworkWithLikes;
  likedIds: Set<string>;
  userId?: string | null;
  onLikeUpdate?: (artworkId: string, liked: boolean, count: number) => void;
  priority?: boolean;
  variant?: FeedArtworkCardVariant;
  /** When true, show a quiet `Inquire` label for `pricing_mode === "inquire"`. */
  showPrice?: boolean;
  /** When true, render the artist's primary role chip on desktop. */
  showRoleChip?: boolean;
  /** When true, render the small claim/multi-claim summary line. */
  showClaimLine?: boolean;
};

export function FeedArtworkCard({
  artwork,
  likedIds,
  userId = null,
  onLikeUpdate,
  priority = false,
  variant = "feedTile",
  showPrice = false,
  showRoleChip = false,
  showClaimLine = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useT();
  const images = artwork.artwork_images ?? [];
  const sorted = [...images].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const first = sorted[0];
  // Anchor tiles are visibly larger; thumb (400px) blurs noticeably there,
  // so anchors load `medium` (1200px) while standard / mini stay on thumb to
  // keep the first-screen network footprint small (Work Order §2.1 / §C4).
  const imageVariant: "thumb" | "medium" =
    variant === "feedAnchor" ? "medium" : "thumb";
  const imageUrl = first
    ? getArtworkImageUrl(first.storage_path, imageVariant)
    : null;

  const artistProfile = (artwork as { profiles?: ArtistProfileLite | null }).profiles ?? null;
  const primaryClaim = getPrimaryClaim(artwork);
  const externalName = primaryClaim
    ? ((artwork.claims ?? []).find(
        (c) =>
          (c as { external_artists?: { display_name?: string | null } }).external_artists
            ?.display_name
      ) as { external_artists?: { display_name?: string | null } } | undefined)
        ?.external_artists?.display_name ?? null
    : null;

  const artistIdentityInput = externalName
    ? { display_name: externalName, username: null }
    : artistProfile;
  const { primary: artistName } = formatIdentityPair(artistIdentityInput, t);
  const artistRoleChips = formatRoleChips(artistIdentityInput, t, { max: 1 });
  const artistUsername = hasPublicLinkableUsername(artistProfile)
    ? artistProfile?.username ?? ""
    : "";
  const claimCount = artwork.claims?.length ?? 0;

  const isAnchor = variant === "feedAnchor";
  const isMini = variant === "discoveryMini";
  // Anchor stays square so the salon row keeps a calm rhythm; the anchor's
  // visual weight comes from its wider column span, not a taller aspect.
  // A taller aspect would push the row height up and stretch sibling tiles.
  const aspectClass = "aspect-square";
  const radiusClass = isMini ? "rounded-lg" : "rounded-xl";
  const padClass = isMini ? "p-2.5" : "p-3";
  const borderClass = "border-zinc-200";

  function handleClick() {
    setArtworkBack(pathname ?? "/feed");
    router.push(`/artwork/${artwork.id}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }

  const inquireBadge =
    showPrice && artwork.pricing_mode === "inquire" ? (
      <span className="text-[11px] font-normal text-zinc-500">
        {t("feed.inquireQuiet")}
      </span>
    ) : null;

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={artwork.title ?? undefined}
      className={`group flex h-full cursor-pointer flex-col overflow-hidden border bg-white transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-400 ${radiusClass} ${borderClass}`}
    >
      <div className={`relative w-full bg-zinc-100 ${aspectClass}`}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={artwork.title ?? ""}
            fill
            sizes={
              isAnchor
                ? "(max-width: 768px) 50vw, 50vw"
                : isMini
                  ? "(max-width: 768px) 33vw, 200px"
                  : "(max-width: 768px) 50vw, 33vw"
            }
            loading={priority ? "eager" : "lazy"}
            priority={priority}
            className="object-contain transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
            {/* Intentionally muted: image-less tiles should disappear quietly, not shout "no image". */}
          </div>
        )}
        {!isMini && userId && (
          <div
            className="absolute bottom-2 right-2"
            onClick={(e) => e.stopPropagation()}
          >
            <LikeButton
              artworkId={artwork.id}
              likesCount={artwork.likes_count ?? 0}
              isLiked={likedIds.has(artwork.id)}
              onUpdate={(newLiked, newCount) =>
                onLikeUpdate?.(artwork.id, newLiked, newCount)
              }
              size="sm"
            />
          </div>
        )}
      </div>

      {isMini ? (
        <div className={`flex flex-1 flex-col gap-0.5 ${padClass}`}>
          <h3 className="truncate text-xs font-medium text-zinc-900">
            {artwork.title ?? ""}
          </h3>
        </div>
      ) : (
        <div className={`flex flex-1 flex-col gap-1 ${padClass}`}>
          {/* Artist identity — single line, never wraps. Role chip is desktop-only and opt-in. */}
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span className="min-w-0 truncate">
              {artistUsername ? (
                <Link
                  href={`/u/${artistUsername}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-zinc-900 hover:underline"
                >
                  {artistName}
                </Link>
              ) : (
                <span className="font-medium text-zinc-900">
                  {formatDisplayName(artistIdentityInput, t)}
                </span>
              )}
            </span>
            {showRoleChip && artistRoleChips[0] && (
              <span className="hidden shrink-0 rounded-full border border-zinc-200 px-1.5 py-0.5 text-[10px] font-normal text-zinc-500 sm:inline-block">
                {artistRoleChips[0].label}
              </span>
            )}
          </div>

          <h3 className="truncate text-sm font-semibold text-zinc-900">
            {artwork.title ?? ""}
          </h3>

          {(artwork.year || artwork.medium) && (
            <p className="truncate text-xs text-zinc-500">
              {[artwork.year, artwork.medium].filter(Boolean).join(" · ")}
            </p>
          )}

          {(showClaimLine && claimCount > 0) || inquireBadge ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500">
              {showClaimLine && claimCount > 1 && (
                <span title={t("artwork.viewHistory")}>
                  +{claimCount - 1} {t("artwork.moreInHistory")}
                </span>
              )}
              {inquireBadge}
            </div>
          ) : null}

          {userId && canEditArtwork(artwork, userId) && (
            <Link
              href={`/artwork/${artwork.id}/edit`}
              onClick={(e) => e.stopPropagation()}
              // Edit affordance only appears on desktop where there's clean room.
              className="mt-0.5 hidden self-start text-[11px] text-zinc-500 hover:text-zinc-800 sm:inline"
            >
              {t("common.edit")}
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
