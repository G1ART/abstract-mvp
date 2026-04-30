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
 * - `feedTile`: standard tile in the salon grid. Borderless, magazine-style:
 *   image on top, three-line meta block below (artist / title / year·medium).
 * - `feedAnchor`: spotlight tile on `lg+`. Same meta vocabulary as the tile;
 *   visual weight comes from a wider column span (col-span-2 row-span-2) and
 *   a higher-resolution image, not a louder frame.
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
  // Anchor/spotlight tiles are visibly larger (~600px wide on lg); thumb
  // (400px) blurs noticeably there, so anchors load `medium` (1200px) while
  // standard tiles (~290px col-1/4) and mini stay on thumb to keep the
  // first-screen network footprint small.
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
  // Standard tiles use a 4:5 portrait aspect for a magazine rhythm. Anchor /
  // spotlight stays square because its wider column span already gives it
  // visual weight; a taller anchor would push the row height up. Mini stays
  // square as a quiet strip thumb.
  const aspectClass = isAnchor || isMini ? "aspect-square" : "aspect-[4/5]";
  // Mini still gets a soft radius — it lives inside the strip and benefits
  // from a small frame. Tile/anchor are fully borderless (matte image only).
  const imageWrapClass = isMini
    ? "rounded-md overflow-hidden bg-zinc-100"
    : "bg-zinc-50";

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

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={artwork.title ?? undefined}
      className="group flex h-full cursor-pointer flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
    >
      <div className={`relative w-full ${aspectClass} ${imageWrapClass}`}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={artwork.title ?? ""}
            fill
            sizes={
              isAnchor
                ? "(max-width: 1024px) 50vw, 600px"
                : isMini
                  ? "(max-width: 768px) 33vw, 200px"
                  : "(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            }
            loading={priority ? "eager" : "lazy"}
            priority={priority}
            className="object-contain transition-transform duration-300 ease-out group-hover:scale-[1.01]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
            {/* Intentionally muted: image-less tiles should disappear quietly, not shout "no image". */}
          </div>
        )}
        {!isMini && userId && (
          <div
            className="absolute bottom-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
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
        <div className="flex flex-1 flex-col gap-0.5 px-0.5 pt-2">
          <h3 className="truncate text-xs font-medium text-zinc-900">
            {artwork.title ?? ""}
          </h3>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-0.5 pt-3">
          {/* Artist identity — single line, never wraps. */}
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-sm font-medium tracking-tight text-zinc-900">
              {artistUsername ? (
                <Link
                  href={`/u/${artistUsername}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:underline"
                >
                  {artistName}
                </Link>
              ) : (
                <span>{formatDisplayName(artistIdentityInput, t)}</span>
              )}
            </span>
            {showRoleChip && artistRoleChips[0] && (
              <span className="hidden shrink-0 rounded-full border border-zinc-200 px-1.5 py-0.5 text-[10px] font-normal text-zinc-500 lg:inline-block">
                {artistRoleChips[0].label}
              </span>
            )}
          </div>

          <h3 className="truncate text-sm font-normal tracking-tight text-zinc-700">
            {artwork.title ?? ""}
          </h3>

          {(artwork.year || artwork.medium) && (
            <p className="truncate text-xs tracking-tight text-zinc-500">
              {[artwork.year, artwork.medium].filter(Boolean).join(" · ")}
            </p>
          )}

          {showClaimLine && claimCount > 1 ? (
            <p className="text-[11px] tracking-tight text-zinc-500">
              <span title={t("artwork.viewHistory")}>
                +{claimCount - 1} {t("artwork.moreInHistory")}
              </span>
            </p>
          ) : null}

          {userId && canEditArtwork(artwork, userId) && (
            <Link
              href={`/artwork/${artwork.id}/edit`}
              onClick={(e) => e.stopPropagation()}
              // Edit affordance hidden by default; reveals on hover/focus on
              // lg+ where there's clean room. Keeps the salon spread quiet.
              className="mt-1 hidden self-start text-[11px] text-zinc-500 opacity-0 transition-opacity hover:text-zinc-800 group-hover:opacity-100 group-focus-within:opacity-100 lg:inline-block"
            >
              {t("common.edit")}
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
