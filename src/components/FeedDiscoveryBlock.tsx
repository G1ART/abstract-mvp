"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/useT";
import type { PeopleRec } from "@/lib/supabase/peopleRecs";
import type { ArtworkWithLikes } from "@/lib/supabase/artworks";
import { getStorageUrl } from "@/lib/supabase/artworks";
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
  return getStorageUrl(avatarUrl);
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
  const displayName = profile.display_name ?? username;
  const avatarUrl = getAvatarUrl(profile.avatar_url);
  const tags = profile.reason_tags ?? [];
  const whyKey = tags.includes("follow_graph")
    ? "feed.recommendedWhyNetwork"
    : "feed.recommendedWhyLikes";

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
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-medium text-zinc-500">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {t("feed.recommendedLabel")}
          </p>
          <p className="font-semibold text-zinc-900">{displayName}</p>
          {username && (
            <p className="text-sm text-zinc-500">@{username}</p>
          )}
          <p className="mt-0.5 text-xs text-zinc-500">{t(whyKey)}</p>
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
