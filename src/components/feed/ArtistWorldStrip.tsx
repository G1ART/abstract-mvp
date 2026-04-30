"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/useT";
import {
  formatIdentityPair,
  formatRoleChips,
} from "@/lib/identity/format";
import { reasonTagToI18n } from "@/lib/people/reason";
import {
  type ArtworkWithLikes,
  getArtworkImageUrl,
} from "@/lib/supabase/artworks";
import type { PeopleRec } from "@/lib/supabase/peopleRecs";
import { FollowButton } from "@/components/FollowButton";
import { FeedArtworkCard } from "@/components/FeedArtworkCard";

type Props = {
  profile: PeopleRec;
  artworks: ArtworkWithLikes[];
  likedIds: Set<string>;
  initialFollowing: boolean;
  userId: string | null;
  onLikeUpdate: (artworkId: string, liked: boolean, count: number) => void;
};

function getAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  return getArtworkImageUrl(avatarUrl, "avatar");
}

/**
 * Living Salon "Artist world" strip — replaces the older recommendation
 * block. The visual grammar is intentionally calmer than a card: no dashed
 * border, no oversized avatar, no nested full-card grid. The label, name,
 * and reason sit on the left; up to three compact thumbnails sit on the
 * right (or below on mobile) and the strip closes with quiet text actions.
 */
export function ArtistWorldStrip({
  profile,
  artworks,
  likedIds,
  initialFollowing,
  userId,
  onLikeUpdate,
}: Props) {
  const router = useRouter();
  const { t } = useT();
  const username = profile.username ?? "";
  const { primary: displayName, secondary: handleLabel } =
    formatIdentityPair(profile);
  const avatarUrl = getAvatarUrl(profile.avatar_url);
  const tags = profile.reason_tags ?? [];
  const roleChips = formatRoleChips(profile, t, { max: 1 });
  const reasonLine = reasonTagToI18n(tags, t);
  const visibleArtworks = artworks.slice(0, 3);

  function handleHeaderClick() {
    if (username) router.push(`/u/${username}`);
  }

  function handleHeaderKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleHeaderClick();
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50/60">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-6">
        <div
          role="button"
          tabIndex={0}
          onClick={handleHeaderClick}
          onKeyDown={handleHeaderKeyDown}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 focus:outline-none focus:ring-2 focus:ring-zinc-300"
        >
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-200">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt=""
                width={40}
                height={40}
                sizes="40px"
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-medium text-zinc-500">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
              {t("feed.artistWorldLabel")}
            </p>
            <p className="mt-0.5 truncate text-base font-semibold text-zinc-900">
              {displayName}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
              {handleLabel && (
                <span className="truncate">{handleLabel}</span>
              )}
              {roleChips[0] && (
                <span className="rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-500">
                  {roleChips[0].label}
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
              {reasonLine}
            </p>
          </div>
        </div>

        <div
          className="flex shrink-0 flex-wrap items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {username && (
            <Link
              href={`/u/${username}`}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              {t("feed.viewArtist")}
            </Link>
          )}
          {userId && userId !== profile.id && (
            <FollowButton
              targetProfileId={profile.id}
              initialFollowing={initialFollowing}
              isPrivateTarget={profile.is_public === false}
            />
          )}
        </div>
      </div>

      {visibleArtworks.length > 0 && (
        <div className="grid grid-cols-3 gap-2 border-t border-zinc-200 p-4 sm:gap-3 sm:p-5">
          {visibleArtworks.map((artwork) => (
            <div key={artwork.id} className="min-w-0">
              <FeedArtworkCard
                artwork={artwork}
                likedIds={likedIds}
                userId={userId}
                onLikeUpdate={onLikeUpdate}
                variant="discoveryMini"
              />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
