"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useT } from "@/lib/i18n/useT";
import type { ProfilePublic } from "@/lib/supabase/profiles";
import type { ArtworkWithLikes } from "@/lib/supabase/artworks";
import { getStorageUrl } from "@/lib/supabase/artworks";
import { getLikedArtworkIds } from "@/lib/supabase/likes";
import { ProfileActions } from "./ProfileActions";
import { ArtworkCard } from "./ArtworkCard";

const PROFILE_UPDATED_KEY = "profile_updated";

type Props = {
  profile: ProfilePublic;
  artworks: ArtworkWithLikes[];
};

function getAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  return getStorageUrl(avatarUrl);
}

export function UserProfileContent({ profile, artworks }: Props) {
  const { t } = useT();
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [showUpdatedBanner, setShowUpdatedBanner] = useState(false);

  useEffect(() => {
    const ids = artworks.map((a) => a.id);
    getLikedArtworkIds(ids).then(setLikedIds);
  }, [artworks]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(PROFILE_UPDATED_KEY) === "true") {
      window.sessionStorage.removeItem(PROFILE_UPDATED_KEY);
      setShowUpdatedBanner(true);
      const t = setTimeout(() => setShowUpdatedBanner(false), 2000);
      return () => clearTimeout(t);
    }
  }, []);

  const username = profile.username ?? "";
  const displayName = profile.display_name ?? username;
  const avatarUrl = getAvatarUrl(profile.avatar_url);
  const roles = (profile.roles ?? []).filter(Boolean);
  const mainRole = profile.main_role;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {showUpdatedBanner && (
        <div
          role="status"
          className="mb-4 rounded bg-green-100 px-4 py-2 text-sm font-medium text-green-800"
        >
          {t("profile.updatedBanner")}
        </div>
      )}
      <div className="mb-8 flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-zinc-200">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt=""
                width={80}
                height={80}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-medium text-zinc-500">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-zinc-900">{displayName}</h1>
            <p className="text-sm text-zinc-500">@{username}</p>
            <div className="mt-2">
              <ProfileActions profileId={profile.id} />
            </div>
          </div>
        </div>

        {profile.bio ? (
          <p className="text-sm text-zinc-700">{profile.bio}</p>
        ) : (
          <p className="text-sm text-zinc-400">{t("profile.noBio")}</p>
        )}

        {roles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {[mainRole, ...roles.filter((r) => r !== mainRole)]
              .filter(Boolean)
              .map((r) => (
                <span
                  key={r!}
                  className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-700"
                >
                  {r}
                </span>
              ))}
          </div>
        )}

        {(profile.website || profile.location) && (
          <p className="text-sm text-zinc-600">
            {[profile.website, profile.location].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      <h2 className="mb-4 text-lg font-semibold text-zinc-900">{t("profile.works")}</h2>
      {artworks.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">{t("profile.noWorks")}</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {artworks.map((artwork) => (
            <ArtworkCard
              key={artwork.id}
              artwork={artwork}
              likesCount={artwork.likes_count ?? 0}
              isLiked={likedIds.has(artwork.id)}
              onLikeUpdate={(id, liked, count) => {
                setLikedIds((prev) => {
                  const next = new Set(prev);
                  if (liked) next.add(id);
                  else next.delete(id);
                  return next;
                });
              }}
            />
          ))}
        </div>
      )}
    </main>
  );
}
