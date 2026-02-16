"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { useT } from "@/lib/i18n/useT";
import { getSession } from "@/lib/supabase/auth";
import { getMyProfile } from "@/lib/supabase/profiles";
import type { ProfilePublic } from "@/lib/supabase/profiles";
import type { ArtworkWithLikes } from "@/lib/supabase/artworks";
import { getStorageUrl, updateMyArtworkOrder } from "@/lib/supabase/artworks";
import { getLikedArtworkIds } from "@/lib/supabase/likes";
import { ProfileActions } from "./ProfileActions";
import { ProfileViewTracker } from "./ProfileViewTracker";
import { ArtworkCard } from "./ArtworkCard";
import { SortableArtworkCard } from "./SortableArtworkCard";

const PROFILE_UPDATED_KEY = "profile_updated";

type Props = {
  profile: ProfilePublic;
  artworks: ArtworkWithLikes[];
  initialReorderMode?: boolean;
};

function getAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  return getStorageUrl(avatarUrl);
}

export function UserProfileContent({ profile, artworks, initialReorderMode = false }: Props) {
  const { t } = useT();
  const router = useRouter();
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [showUpdatedBanner, setShowUpdatedBanner] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [localArtworks, setLocalArtworks] = useState<ArtworkWithLikes[]>(artworks);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setLocalArtworks(artworks);
  }, [artworks]);

  useEffect(() => {
    if (initialReorderMode && isOwner && artworks.length > 0) setReorderMode(true);
  }, [initialReorderMode, isOwner, artworks.length]);

  useEffect(() => {
    function resolveOwner(sessionUserId: string | undefined): void {
      if (!sessionUserId) {
        setIsOwner(false);
        return;
      }
      const idMatch = !!profile?.id && profile.id === sessionUserId;
      if (idMatch) {
        setIsOwner(true);
        return;
      }
      getMyProfile().then(({ data: myProfile }) => {
        if (!myProfile) {
          setIsOwner(idMatch);
          return;
        }
        const usernameMatch =
          profile?.username &&
          (myProfile as { username?: string | null }).username &&
          String(profile.username).trim().toLowerCase() ===
            String((myProfile as { username?: string | null }).username).trim().toLowerCase();
        setIsOwner(idMatch || (!!sessionUserId && !!usernameMatch));
      });
    }

    getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (uid) {
        resolveOwner(uid);
        return;
      }
      setTimeout(() => {
        getSession().then(({ data: { session: retrySession } }) => {
          resolveOwner(retrySession?.user?.id);
        });
      }, 400);
    });
  }, [profile?.id, profile?.username]);

  useEffect(() => {
    const ids = artworks.map((a) => a.id);
    getLikedArtworkIds(ids).then(setLikedIds);
  }, [artworks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalArtworks((prev) => {
      const ids = prev.map((a) => a.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = [...prev];
      const [removed] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, removed);
      return next;
    });
  }, []);

  const handleSaveReorder = useCallback(async () => {
    setSaveError(null);
    setSaving(true);
    const orderedIds = localArtworks.map((a) => a.id);
    const { error } = await updateMyArtworkOrder(orderedIds);
    setSaving(false);
    if (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setSaveError(msg);
      return;
    }
    setReorderMode(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
    router.refresh();
  }, [localArtworks, router]);

  const handleCancelReorder = useCallback(() => {
    setReorderMode(false);
    setLocalArtworks(artworks);
    setSaveError(null);
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
    <>
      <ProfileViewTracker profileId={profile.id} />
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
          <p className="whitespace-pre-line text-sm text-zinc-700">{profile.bio}</p>
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

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">{t("profile.works")}</h2>
        {isOwner && artworks.length > 0 && !reorderMode && (
          <button
            type="button"
            onClick={() => { setReorderMode(true); setSaveError(null); }}
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            {t("profile.reorder")}
          </button>
        )}
        {reorderMode && isOwner && artworks.length > 0 && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveReorder}
              disabled={saving}
              className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {t("profile.reorderSave")}
            </button>
            <button
              type="button"
              onClick={handleCancelReorder}
              disabled={saving}
              className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {t("profile.reorderCancel")}
            </button>
          </div>
        )}
      </div>
      {reorderMode && isOwner && (
        <p className="mb-4 text-sm text-zinc-500">{t("profile.reorderHint")}</p>
      )}
      {reorderMode && isOwner && artworks.length > 0 ? (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localArtworks.map((a) => a.id)} strategy={rectSortingStrategy}>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {localArtworks.map((artwork) => (
                  <SortableArtworkCard
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
            </SortableContext>
          </DndContext>
          {saveError && (
            <div className="mt-4 flex items-center gap-3 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              <span>{t("profile.reorderSaveFailed")}: {saveError}</span>
              <button
                type="button"
                onClick={handleSaveReorder}
                disabled={saving}
                className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t("common.retry")}
              </button>
            </div>
          )}
        </>
      ) : artworks.length === 0 ? (
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
      {savedToast && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
          {t("common.saved")}
        </div>
      )}
      </main>
    </>
  );
}
