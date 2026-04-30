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
import type { LivingSalonPersona } from "@/lib/feed/livingSalon";
import type { PeopleRec } from "@/lib/supabase/peopleRecs";
import { FollowButton } from "@/components/FollowButton";
import { FeedArtworkCard } from "@/components/FeedArtworkCard";

type Props = {
  profile: PeopleRec;
  persona: LivingSalonPersona;
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

const PERSONA_LABEL_KEY: Record<LivingSalonPersona, string> = {
  artist: "feed.artistWorldLabel",
  curator: "feed.curatorMeetLabel",
  gallerist: "feed.galleristRoomLabel",
  collector: "feed.collectorEyeLabel",
};

/**
 * Living Salon people-introduction strip — quieter than a card, calmer
 * than a profile preview. A two-column row on `sm+`: identity on the
 * left, persona-aware right column.
 *
 * - artist: right column shows up to 4 small inline thumbnails of recent
 *   public works (each ~half the size of the previous strip's thumbs so
 *   the strip feels like a discovery hook rather than a content tile).
 * - curator / gallerist / collector: text-only — the identity column
 *   stands on its own. Profiles whose `main_role` is none of these four
 *   are filtered out by the builder before they reach this component.
 */
export function ArtistWorldStrip({
  profile,
  persona,
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
  const personaLabel = t(PERSONA_LABEL_KEY[persona]);
  const viewLabel = persona === "artist"
    ? t("feed.viewArtist")
    : t("feed.viewProfile");
  const showThumbs = persona === "artist" && artworks.length > 0;
  const visibleArtworks = artworks.slice(0, 4);

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
    <article className="border-y border-zinc-100 py-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10">
        <div
          className={`flex min-w-0 ${showThumbs ? "sm:flex-1" : "flex-1"} items-start gap-4`}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={handleHeaderClick}
            onKeyDown={handleHeaderKeyDown}
            className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-100">
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
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                {personaLabel}
              </p>
              <p className="mt-1 truncate text-base font-semibold tracking-tight text-zinc-900">
                {displayName}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                {handleLabel && (
                  <span className="truncate">{handleLabel}</span>
                )}
                {roleChips[0] && (
                  <span className="rounded-full border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500">
                    {roleChips[0].label}
                  </span>
                )}
              </div>
              {reasonLine && (
                <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-zinc-500">
                  {reasonLine}
                </p>
              )}
            </div>
          </div>

          <div
            className="flex shrink-0 flex-col items-end gap-3 self-start pt-1 sm:flex-row sm:items-center sm:gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {username && (
              <Link
                href={`/u/${username}`}
                className="text-sm font-medium tracking-tight text-zinc-700 underline-offset-4 hover:underline"
              >
                {viewLabel}
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

        {showThumbs && (
          <div className="grid w-full grid-cols-4 gap-2 sm:max-w-[44%] sm:gap-3">
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
      </div>
    </article>
  );
}
