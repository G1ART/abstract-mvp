"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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
import { canEditArtwork, getArtworkImageUrl, updateMyArtworkOrder, getProfileArtworkOrders, applyProfileOrdering } from "@/lib/supabase/artworks";
import { getExhibitionHostCuratorLabel, type ExhibitionWithCredits } from "@/lib/exhibitionCredits";
import { getLikedArtworkIds } from "@/lib/supabase/likes";
import { ProfileActions } from "./ProfileActions";
import { ProfileViewTracker } from "./ProfileViewTracker";
import { ArtworkCard } from "./ArtworkCard";
import { SortableArtworkCard } from "./SortableArtworkCard";
import { Chip, EmptyState } from "@/components/ds";
import { formatIdentityPair, formatRoleChips } from "@/lib/identity/format";

const PROFILE_UPDATED_KEY = "profile_updated";

import {
  filterArtworksByPersona,
  getPersonaCounts,
  type PersonaTab,
} from "@/lib/provenance/personaTabs";

type Props = {
  profile: ProfilePublic;
  artworks: ArtworkWithLikes[];
  exhibitions?: ExhibitionWithCredits[];
  initialReorderMode?: boolean;
};

function getAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  return getArtworkImageUrl(avatarUrl, "avatar");
}

export function UserProfileContent({ profile, artworks, exhibitions = [], initialReorderMode = false }: Props) {
  const { t } = useT();
  const router = useRouter();
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [showUpdatedBanner, setShowUpdatedBanner] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [personaTab, setPersonaTab] = useState<PersonaTab>("all");
  const [localArtworks, setLocalArtworks] = useState<ArtworkWithLikes[]>(artworks);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setLocalArtworks(artworks);
  }, [artworks]);

  useEffect(() => {
    if (exhibitions.length > 0 && artworks.length === 0) {
      setPersonaTab("exhibitions");
    }
  }, []);

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
      setViewerId(uid ?? null);
      if (uid) {
        resolveOwner(uid);
        return;
      }
      setTimeout(() => {
        getSession().then(({ data: { session: retrySession } }) => {
          const retryUid = retrySession?.user?.id;
          setViewerId(retryUid ?? null);
          resolveOwner(retryUid);
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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setLocalArtworks((prev) => {
        // Include artworks where user is artist OR has a claim
        const reorderableIds = prev.filter((a) => {
          const isArtist = a.artist_id === profile.id;
          const hasClaim = (a.claims ?? []).some((c) => c.subject_profile_id === profile.id);
          return isArtist || hasClaim;
        }).map((a) => a.id);
        const oldIndex = reorderableIds.indexOf(active.id as string);
        const newIndex = reorderableIds.indexOf(over.id as string);
        if (oldIndex === -1 || newIndex === -1) return prev;
        const reorderable = prev.filter((a) => {
          const isArtist = a.artist_id === profile.id;
          const hasClaim = (a.claims ?? []).some((c) => c.subject_profile_id === profile.id);
          return isArtist || hasClaim;
        });
        const others = prev.filter((a) => {
          const isArtist = a.artist_id === profile.id;
          const hasClaim = (a.claims ?? []).some((c) => c.subject_profile_id === profile.id);
          return !isArtist && !hasClaim;
        });
        const nextReorderable = [...reorderable];
        const [removed] = nextReorderable.splice(oldIndex, 1);
        nextReorderable.splice(newIndex, 0, removed);
        return [...nextReorderable, ...others];
      });
    },
    [profile.id]
  );

  const handleSaveReorder = useCallback(async () => {
    setSaveError(null);
    setSaving(true);
    const orderedIds = localArtworks
      .filter((a) => {
        const isArtist = a.artist_id === profile.id;
        const hasClaim = (a.claims ?? []).some((c) => c.subject_profile_id === profile.id);
        return isArtist || hasClaim;
      })
      .map((a) => a.id);
    const { error } = await updateMyArtworkOrder(orderedIds, profile.id);
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
  }, [localArtworks, profile.id, router]);

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

  const { primary: displayName, secondary: usernameHandle } = formatIdentityPair(profile, t);
  const avatarUrl = getAvatarUrl(profile.avatar_url);
  const roleChips = formatRoleChips(profile, t, { max: 6 });

  const personaCounts = useMemo(
    () => getPersonaCounts(artworks, profile.id),
    [artworks, profile.id]
  );
  const displayedArtworks = useMemo(
    () => filterArtworksByPersona(artworks, profile.id, personaTab),
    [artworks, profile.id, personaTab]
  );
  // Reorderable artworks: user is artist OR has any claim (not just CREATED)
  const reorderableArtworks = useMemo(
    () => localArtworks.filter((a) => {
      const isArtist = a.artist_id === profile.id;
      const hasClaim = (a.claims ?? []).some((c) => c.subject_profile_id === profile.id);
      return isArtist || hasClaim;
    }),
    [localArtworks, profile.id]
  );

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
                sizes="80px"
                priority
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-medium text-zinc-500">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-zinc-900">{displayName}</h1>
            {usernameHandle && (
              <p className="text-sm text-zinc-500">{usernameHandle}</p>
            )}
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

        {roleChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {roleChips.map((chip) => (
              <Chip key={chip.key} tone={chip.isPrimary ? "accent" : "neutral"}>
                {chip.label}
              </Chip>
            ))}
          </div>
        )}

        {(profile.website || profile.location) && (
          <p className="text-sm text-zinc-600">
            {[profile.website, profile.location].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {/* Persona tabs: exhibitions, CREATED, OWNS, all */}
      {(personaCounts.all > 0 || exhibitions.length > 0) && (
        <div className="mb-4 flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
          {[
            ...(exhibitions.length > 0
              ? [{ tab: "exhibitions" as PersonaTab, label: t("exhibition.myExhibitions"), count: exhibitions.length }]
              : []),
            ...(personaCounts.created > 0
              ? [{ tab: "CREATED" as PersonaTab, label: t("profile.personaWork"), count: personaCounts.created }]
              : []),
            ...(personaCounts.owns > 0
              ? [{ tab: "OWNS" as PersonaTab, label: t("profile.personaCollected"), count: personaCounts.owns }]
              : []),
            ...(personaCounts.all > 0
              ? [{ tab: "all" as PersonaTab, label: t("profile.personaAll"), count: personaCounts.all }]
              : []),
          ].map(({ tab, label, count }) => (
            <button
              key={tab}
              type="button"
              onClick={() => setPersonaTab(tab)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                personaTab === tab
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">
          {personaTab === "exhibitions" ? t("exhibition.myExhibitions") : t("profile.works")}
        </h2>
        {personaTab !== "exhibitions" && isOwner && reorderableArtworks.length > 0 && !reorderMode && (
          <button
            type="button"
            onClick={() => { setReorderMode(true); setSaveError(null); }}
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            {t("profile.reorder")}
          </button>
        )}
        {personaTab !== "exhibitions" && reorderMode && isOwner && reorderableArtworks.length > 0 && (
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
      {personaTab !== "exhibitions" && reorderMode && isOwner && (
        <p className="mb-4 text-sm text-zinc-500">{t("profile.reorderHint")}</p>
      )}
      {personaTab === "exhibitions" ? (
        exhibitions.length === 0 ? (
          <EmptyState title={t("exhibition.emptyList")} size="sm" />
        ) : (
          <ul className="space-y-2">
            {exhibitions.map((ex) => {
              const firstCover = (ex.cover_image_paths ?? [])[0];
              return (
                <li key={ex.id}>
                  <Link
                    href={`/e/${ex.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100">
                      {firstCover ? (
                        <Image
                          src={getArtworkImageUrl(firstCover, "thumb")}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="56px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-zinc-400">·</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-900">{ex.title}</p>
                      <p className="truncate text-xs text-zinc-500">
                        {ex.start_date && ex.end_date ? `${ex.start_date} – ${ex.end_date}` : ex.start_date ?? ex.status}
                        {" · "}
                        {getExhibitionHostCuratorLabel(ex, t)}
                      </p>
                      <p className="text-[11px] text-zinc-400">{t("exhibition.works")} →</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : reorderMode && isOwner && artworks.length > 0 ? (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={reorderableArtworks.map((a) => a.id)} strategy={rectSortingStrategy}>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {reorderableArtworks.map((artwork) => (
                  <SortableArtworkCard
                    key={artwork.id}
                    artwork={artwork}
                    likesCount={artwork.likes_count ?? 0}
                    isLiked={likedIds.has(artwork.id)}
                    viewerId={viewerId}
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
      ) : displayedArtworks.length === 0 ? (
        <EmptyState title={t("profile.noWorks")} size="sm" />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {displayedArtworks.map((artwork) => (
            <ArtworkCard
              key={artwork.id}
              artwork={artwork}
              likesCount={artwork.likes_count ?? 0}
              isLiked={likedIds.has(artwork.id)}
              showEdit={isOwner && !!profile?.id && canEditArtwork(artwork, profile.id)}
              viewerId={viewerId}
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
