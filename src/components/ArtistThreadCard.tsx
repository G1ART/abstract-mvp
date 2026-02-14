"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ArtworkWithLikes, getStorageUrl } from "@/lib/supabase/artworks";
import { FollowButton } from "./FollowButton";
import { LikeButton } from "./LikeButton";

export type ArtistThreadArtist = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
  roles?: string[] | null;
};

type Props = {
  artist: ArtistThreadArtist;
  artworks: ArtworkWithLikes[];
  likedIds: Set<string>;
  initialFollowing?: boolean;
  onLikeUpdate: (artworkId: string, liked: boolean, count: number) => void;
};

const MAX_WORKS_IN_THREAD = 6;

function getAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  return getStorageUrl(avatarUrl);
}

export function ArtistThreadCard({
  artist,
  artworks,
  likedIds,
  initialFollowing = false,
  onLikeUpdate,
}: Props) {
  const router = useRouter();
  const username = artist.username ?? "";
  const displayName = artist.display_name ?? username;
  const avatarUrl = getAvatarUrl(artist.avatar_url);
  const worksToShow = artworks.slice(0, MAX_WORKS_IN_THREAD);

  function handleHeaderClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (username) router.push(`/u/${username}`);
  }

  function handleHeaderKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (username) router.push(`/u/${username}`);
    }
  }

  return (
    <article className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      {/* Header row */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleHeaderClick}
        onKeyDown={handleHeaderKeyDown}
        className="flex cursor-pointer items-center gap-3 p-4 hover:bg-zinc-50"
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
          <p className="font-medium text-zinc-900">{displayName}</p>
          <p className="text-sm text-zinc-500">@{username}</p>
        </div>
        <div
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <FollowButton targetProfileId={artist.id} initialFollowing={initialFollowing} size="sm" />
        </div>
      </div>

      {/* Bio (clamp 2 lines) */}
      {artist.bio && (
        <p className="line-clamp-2 px-4 pb-2 text-sm text-zinc-600">{artist.bio}</p>
      )}

      {/* Mini gallery */}
      <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-6">
        {worksToShow.map((artwork) => {
          const images = artwork.artwork_images ?? [];
          const sorted = [...images].sort(
            (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
          );
          const first = sorted[0];
          const imageUrl = first
            ? getStorageUrl(first.storage_path)
            : null;

          return (
            <div
              key={artwork.id}
              className="group relative aspect-square overflow-hidden rounded-md bg-zinc-100"
            >
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/artwork/${artwork.id}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/artwork/${artwork.id}`);
                  }
                }}
                className="absolute inset-0 cursor-pointer"
              />
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={artwork.title ?? "Artwork"}
                  width={200}
                  height={200}
                  className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-400">
                  No image
                </div>
              )}
              <div
                className="absolute bottom-1 right-1"
                onClick={(e) => e.stopPropagation()}
              >
                <LikeButton
                  artworkId={artwork.id}
                  likesCount={artwork.likes_count ?? 0}
                  isLiked={likedIds.has(artwork.id)}
                  onUpdate={(newLiked, newCount) =>
                    onLikeUpdate(artwork.id, newLiked, newCount)
                  }
                  size="sm"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* View profile link */}
      {username && (
        <div className="border-t border-zinc-100 px-4 py-2">
          <Link
            href={`/u/${username}`}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            View profile →
          </Link>
        </div>
      )}
    </article>
  );
}
