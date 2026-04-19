"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/useT";
import type { PeopleRec } from "@/lib/supabase/recommendations";
import type { ArtworkWithLikes } from "@/lib/supabase/artworks";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";
import { formatIdentityPair, formatRoleChips } from "@/lib/identity/format";
import { reasonTagToI18n } from "@/lib/people/reason";
import { FollowButton } from "./FollowButton";
import { FeedArtworkCard } from "./FeedArtworkCard";

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

export function FeedDiscoveryBlock({
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
  const roleChips = formatRoleChips(profile, t, { max: 2 });
  const reasonLine = reasonTagToI18n(tags, t);

  function handleClick() {
    if (username) router.push(`/u/${username}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }

  return (
    <article className="col-span-full overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 lg:col-span-2">
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="flex cursor-pointer items-center gap-3 p-4 hover:bg-zinc-100/80"
      >
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-200">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={48}
              height={48}
              sizes="48px"
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-medium text-zinc-500">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {t("feed.recommendedLabelPeople")}
          </p>
          <p className="font-semibold text-zinc-900">{displayName}</p>
          {handleLabel && (
            <p className="text-sm text-zinc-500">{handleLabel}</p>
          )}
          {roleChips.length > 0 && (
            <p className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-zinc-500">
              {roleChips.map((chip) => (
                <span
                  key={chip.key}
                  className={`rounded-full border px-2 py-0.5 ${chip.isPrimary ? "border-zinc-400 bg-zinc-50 text-zinc-700" : "border-zinc-200 text-zinc-500"}`}
                >
                  {chip.label}
                </span>
              ))}
            </p>
          )}
          <p className="mt-0.5 text-xs text-zinc-500">{reasonLine}</p>
        </div>
        {userId && userId !== profile.id && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <FollowButton
              targetProfileId={profile.id}
              initialFollowing={initialFollowing}
              size="sm"
            />
          </div>
        )}
      </div>
      {artworks.length > 0 && (
        <div className="grid grid-cols-2 gap-2 border-t border-zinc-200 p-4 sm:grid-cols-3">
          {artworks.slice(0, 3).map((artwork) => (
            <div key={artwork.id} className="min-w-0">
              <FeedArtworkCard
                artwork={artwork}
                likedIds={likedIds}
                userId={userId}
                onLikeUpdate={onLikeUpdate}
              />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
