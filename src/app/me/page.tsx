"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { ArtworkCard } from "@/components/ArtworkCard";
import {
  getMyProfile,
  getMyStats,
  listMyArtworks,
  type MyStats,
} from "@/lib/supabase/me";
import {
  getProfileViewsCount,
  getProfileViewers,
  type ProfileViewerRow,
} from "@/lib/supabase/profileViews";
import { getMyEntitlements, hasFeature, type Plan } from "@/lib/entitlements";
import {
  type ArtworkWithLikes,
  deleteArtworkCascade,
  getStorageUrl,
} from "@/lib/supabase/artworks";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  main_role: string | null;
  roles: string[] | null;
  profile_completeness?: number | null;
};

export default function MePage() {
  const { t } = useT();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [artworks, setArtworks] = useState<ArtworkWithLikes[]>([]);
  const [profileViewsCount, setProfileViewsCount] = useState<number | null>(null);
  const [viewers, setViewers] = useState<ProfileViewerRow[]>([]);
  const [canViewViewers, setCanViewViewers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletedToast, setDeletedToast] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, statsRes, artworksRes, entRes] = await Promise.all([
        getMyProfile(),
        getMyStats(),
        listMyArtworks({ limit: 50 }),
        getMyEntitlements(),
      ]);

      if (profileRes.error) {
        setError(
          profileRes.error instanceof Error ? profileRes.error.message : "Failed to load profile"
        );
        return;
      }
      if (statsRes.error) {
        setError(
          statsRes.error instanceof Error ? statsRes.error.message : "Failed to load stats"
        );
        return;
      }

      const profileData = profileRes.data as Profile | null;
      setProfile(profileData);
      setStats(statsRes.data ?? null);
      setArtworks(artworksRes.data ?? []);
      const canView = hasFeature(entRes.plan as Plan, "VIEW_PROFILE_VIEWERS_LIST");
      setCanViewViewers(canView);

      if (profileData?.id) {
        const [countRes, viewersRes] = await Promise.all([
          getProfileViewsCount(profileData.id, 7),
          canView ? getProfileViewers(profileData.id, { limit: 10 }) : { data: [], nextCursor: null, error: null },
        ]);
        setProfileViewsCount(countRes.data);
        setViewers(Array.isArray(viewersRes.data) ? viewersRes.data : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    function onFocus() {
      fetchData();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchData]);

  async function handleDeleteArtwork(artworkId: string) {
    const { error: err } = await deleteArtworkCascade(artworkId);
    if (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      return;
    }
    setDeletedToast(true);
    setTimeout(() => setDeletedToast(false), 2000);
    await fetchData();
  }

  if (loading) {
    return (
      <AuthGate>
        <main className="mx-auto max-w-4xl px-4 py-8">
          <p className="text-zinc-600">{t("me.loading")}</p>
        </main>
      </AuthGate>
    );
  }

  if (error) {
    return (
      <AuthGate>
        <main className="mx-auto max-w-4xl px-4 py-8">
          <p className="text-red-600">{error}</p>
        </main>
      </AuthGate>
    );
  }

  const roles = (profile?.roles ?? []) as string[];

  return (
    <AuthGate>
      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-start gap-4">
          {profile?.avatar_url && (
            <img
              src={
                profile.avatar_url.startsWith("http")
                  ? profile.avatar_url
                  : getStorageUrl(profile.avatar_url)
              }
              alt=""
              className="h-16 w-16 rounded-full object-cover"
            />
          )}
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">
              {profile?.display_name ?? profile?.username ?? "Me"}
            </h1>
            {profile?.username && (
              <p className="text-sm text-zinc-500">@{profile.username}</p>
            )}
            {roles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {roles.map((r) => (
                  <span
                    key={r}
                    className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-700"
                  >
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>
          </div>
          <Link
            href="/settings"
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            Edit profile
          </Link>
        </div>

        {/* Profile completeness */}
        <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-medium text-zinc-900">
            {t("me.profileCompletenessTitle")}: {(profile?.profile_completeness ?? 0)}/100
          </h3>
          <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full bg-zinc-900 transition-all"
              style={{ width: `${profile?.profile_completeness ?? 0}%` }}
            />
          </div>
          <p className="mb-3 text-sm text-zinc-600">{t("me.completenessHint")}</p>
          <Link
            href="/settings"
            className="inline-block rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {t("me.improveProfile")}
          </Link>
        </div>

        {/* KPI cards */}
        <div className="mb-8 grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-2xl font-semibold text-zinc-900">
              {stats?.artworksCount ?? 0}
            </p>
            <p className="text-sm text-zinc-500">Artworks</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-2xl font-semibold text-zinc-900">
              {stats?.followersCount ?? 0}
            </p>
            <p className="text-sm text-zinc-500">Followers</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-2xl font-semibold text-zinc-900">
              {stats?.viewsCount ?? 0}
            </p>
            <p className="text-sm text-zinc-500">Views</p>
          </div>
        </div>

        {/* Profile views insights */}
        <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-medium text-zinc-900">
            {t("insights.profileViewsTitle")} ({t("insights.last7Days")})
          </h3>
          {profileViewsCount === null ? (
            <p className="text-sm text-zinc-500">{t("common.loading")}</p>
          ) : (
            <>
              <p className="text-2xl font-semibold text-zinc-900">{profileViewsCount}</p>
              {canViewViewers ? (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium text-zinc-700">
                    {t("insights.recentViewers")}
                  </p>
                  {viewers.length === 0 ? (
                    <p className="text-sm text-zinc-500">{t("insights.noViewsYet")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {viewers.map((row) => (
                        <li key={row.id}>
                          <Link
                            href={`/u/${row.viewer_profile?.username ?? ""}`}
                            className="flex items-center gap-3 text-sm text-zinc-700 hover:text-zinc-900"
                          >
                            {row.viewer_profile?.avatar_url ? (
                              <img
                                src={
                                  row.viewer_profile.avatar_url.startsWith("http")
                                    ? row.viewer_profile.avatar_url
                                    : getStorageUrl(row.viewer_profile.avatar_url)
                                }
                                alt=""
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs text-zinc-500">
                                {(row.viewer_profile?.display_name ?? row.viewer_profile?.username ?? "?").charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span>
                              {row.viewer_profile?.display_name ?? row.viewer_profile?.username ?? "—"}
                            </span>
                            {row.viewer_profile?.username && (
                              <span className="text-zinc-500">@{row.viewer_profile.username}</span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {viewers.length > 0 && (
                    <Link
                      href="/settings"
                      className="mt-3 inline-block text-sm text-zinc-600 hover:text-zinc-900"
                    >
                      {t("insights.seeAll")}
                    </Link>
                  )}
                </div>
              ) : (
                <Link
                  href="/settings"
                  className="mt-3 inline-block rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {t("insights.upgradeToSeeViewers")}
                </Link>
              )}
            </>
          )}
        </div>

        {/* Profile / Reorder / Upload CTA */}
        <div className="mb-8 flex flex-wrap gap-3">
          {profile?.username ? (
            <>
              <Link
                href={`/u/${profile.username}`}
                className="inline-block rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {t("me.viewPublicProfile")}
              </Link>
              <Link
                href={`/u/${profile.username}?mode=reorder`}
                className="inline-block rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {t("me.reorderPortfolio")}
              </Link>
            </>
          ) : (
            <Link
              href="/onboarding"
              className="inline-block rounded border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50"
            >
              Complete profile →
            </Link>
          )}
          <Link
            href="/upload"
            className="inline-block rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Upload new work
          </Link>
          <Link
            href="/people"
            className="inline-block rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {t("feed.followingEmptyCta")}
          </Link>
        </div>

        {/* My artworks */}
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">{t("me.myArtworks")}</h2>
        {artworks.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-zinc-200 bg-zinc-50 py-12 text-center">
            <p className="text-zinc-600">{t("me.noWorks")}</p>
            <Link
              href="/upload"
              className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              {t("me.uploadFirst")}
            </Link>
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {artworks.map((artwork) => (
                <ArtworkCard
                  key={artwork.id}
                  artwork={artwork}
                  likesCount={artwork.likes_count ?? 0}
                  showDelete
                  onDelete={handleDeleteArtwork}
                />
              ))}
            </div>
            {deletedToast && (
              <div className="fixed bottom-4 right-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
                {t("artwork.deleted")}
              </div>
            )}
          </>
        )}
      </main>
    </AuthGate>
  );
}
