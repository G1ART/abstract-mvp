"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { ArtworkCard } from "@/components/ArtworkCard";
import {
  getMyProfile,
  getMyStats,
  listMyArtworks,
  type MyStats,
} from "@/lib/supabase/me";
import { listPublicArtworksListedByProfileId } from "@/lib/supabase/artworks";
import { computeProfileCompleteness } from "@/lib/profile/completeness";
import {
  getProfileViewsCount,
  getProfileViewers,
  type ProfileViewerRow,
} from "@/lib/supabase/profileViews";
import { getMyEntitlements, hasFeature, type Plan } from "@/lib/entitlements";
import {
  type ArtworkWithLikes,
  canEditArtwork,
  deleteArtworksBatch,
  getArtworkImageUrl,
} from "@/lib/supabase/artworks";
import {
  filterArtworksByPersona,
  getPersonaCounts,
  type PersonaTab,
} from "@/lib/provenance/personaTabs";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  main_role: string | null;
  roles: string[] | null;
  profile_completeness?: number | null;
};

export default function MyPage() {
  const { t } = useT();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [artworks, setArtworks] = useState<ArtworkWithLikes[]>([]);
  const [profileViewsCount, setProfileViewsCount] = useState<number | null>(null);
  const [viewers, setViewers] = useState<ProfileViewerRow[]>([]);
  const [canViewViewers, setCanViewViewers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [computedCompleteness, setComputedCompleteness] = useState<number | null>(null);
  const [personaTab, setPersonaTab] = useState<PersonaTab>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, statsRes, artworksRes, entRes] = await Promise.all([
        getMyProfile(),
        getMyStats(),
        listMyArtworks({ limit: 50, publicOnly: true }),
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

      let mergedArtworks = artworksRes.data ?? [];
      if (profileData?.id) {
        const listedRes = await listPublicArtworksListedByProfileId(profileData.id, {
          limit: 50,
        });
        const listed = listedRes.data ?? [];
        const seen = new Set(mergedArtworks.map((a) => a.id));
        for (const a of listed) {
          if (!seen.has(a.id)) {
            seen.add(a.id);
            mergedArtworks.push(a);
          }
        }
        mergedArtworks.sort(
          (a, b) =>
            new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
        );
      }
      setArtworks(mergedArtworks);
      const canView = hasFeature(entRes.plan as Plan, "VIEW_PROFILE_VIEWERS_LIST");
      setCanViewViewers(canView);

      if (profileData) {
        const base = profileData as Record<string, unknown>;
        const details = (base?.profile_details && typeof base.profile_details === "object")
          ? (base.profile_details as Record<string, unknown>) : {};
        const full = { ...base, ...details };
        const { score } = computeProfileCompleteness(
          full as Parameters<typeof computeProfileCompleteness>[0],
          { hasDetailsLoaded: true }
        );
        setComputedCompleteness(score);
      } else {
        setComputedCompleteness(null);
      }

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

  useEffect(() => {
    if (toast) {
      const tid = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(tid);
    }
  }, [toast]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size >= displayedArtworks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedArtworks.map((a) => a.id)));
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleting(true);
    setShowDeleteConfirm(false);
    const { okIds, failed } = await deleteArtworksBatch(ids);
    setDeleting(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    await fetchData();
    if (failed.length === 0) {
      setToast(t("my.bulkDeleteSuccess").replace("{n}", String(okIds.length)));
    } else if (okIds.length > 0) {
      setToast(t("my.bulkDeletePartial").replace("{ok}", String(okIds.length)).replace("{fail}", String(failed.length)));
    } else {
      setToast(t("my.bulkDeleteFailed"));
    }
  }

  const roles = (profile?.roles ?? []) as string[];
  const displayedArtworks = useMemo(
    () =>
      profile?.id
        ? filterArtworksByPersona(artworks, profile.id, personaTab)
        : artworks,
    [artworks, profile?.id, personaTab]
  );

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
                    : getArtworkImageUrl(profile.avatar_url, "avatar")
                }
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
            )}
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">
                {profile?.display_name ?? profile?.username ?? t("nav.myProfile")}
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
          <div className="flex flex-wrap items-center gap-4">
            {/* Compact completeness status - click → settings */}
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                {t("me.profileCompletenessTitle")}
              </span>
              <Link
                href="/settings"
                title={t("me.completenessHint")}
                className="flex items-center gap-2 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <span className="flex h-1.5 w-12 overflow-hidden rounded-full bg-zinc-200">
                  <span
                    className="h-full bg-zinc-600 transition-all"
                    style={{ width: `${loading || computedCompleteness == null || computedCompleteness === 0 ? 0 : computedCompleteness}%` }}
                  />
                </span>
                <span>{loading ? "—" : (computedCompleteness != null && computedCompleteness > 0 ? `${computedCompleteness}/100` : "—")}</span>
              </Link>
            </div>
            <Link
              href="/settings"
              className="inline-block rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              {t("my.actions.editProfile")}
            </Link>
            {profile?.username && (
              <>
                <Link
                  href={`/u/${profile.username}`}
                  className="inline-block rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {t("my.actions.viewPublicProfile")}
                </Link>
                <Link
                  href={`/u/${profile.username}?mode=reorder`}
                  className="inline-block rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {t("me.reorderPortfolio")}
                </Link>
              </>
            )}
          </div>
        </div>

        {/* KPI row - Following / Followers / Posts / Price inquiries */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Link
            href="/my/following"
            className="rounded-lg border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
          >
            <p className="text-2xl font-semibold text-zinc-900">
              {stats?.followingCount ?? 0}
            </p>
            <p className="text-sm text-zinc-500">{t("my.kpi.following")}</p>
          </Link>
          <Link
            href="/my/followers"
            className="rounded-lg border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
          >
            <p className="text-2xl font-semibold text-zinc-900">
              {stats?.followersCount ?? 0}
            </p>
            <p className="text-sm text-zinc-500">{t("my.kpi.followers")}</p>
          </Link>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-2xl font-semibold text-zinc-900">
              {stats?.postsCount ?? 0}
            </p>
            <p className="text-sm text-zinc-500">{t("my.kpi.posts")}</p>
          </div>
          <Link
            href="/my/inquiries"
            className="rounded-lg border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
          >
            <p className="text-sm font-medium text-zinc-900">{t("priceInquiry.title")}</p>
            <p className="text-xs text-zinc-500">{t("my.kpi.priceInquiries")}</p>
          </Link>
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
                                    : getArtworkImageUrl(row.viewer_profile.avatar_url, "avatar")
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

        {/* Profile / Upload CTA */}
        <div className="mb-8 flex flex-wrap gap-3">
          {!profile?.username && (
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

        {/* Persona tabs */}
        {artworks.length > 0 && profile?.id && (
          <div className="mb-4 flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
            {(() => {
              const counts = getPersonaCounts(artworks, profile.id);
              return [
                { tab: "all" as PersonaTab, label: t("profile.personaAll"), count: counts.all },
                ...(counts.created > 0
                  ? [{ tab: "CREATED" as PersonaTab, label: t("profile.personaWork"), count: counts.created }]
                  : []),
                ...(counts.owns > 0
                  ? [{ tab: "OWNS" as PersonaTab, label: t("profile.personaCollected"), count: counts.owns }]
                  : []),
                ...(counts.inventory > 0
                  ? [{ tab: "INVENTORY" as PersonaTab, label: t("profile.personaGallery"), count: counts.inventory }]
                  : []),
                ...(counts.curated > 0
                  ? [{ tab: "CURATED" as PersonaTab, label: t("profile.personaCurated"), count: counts.curated }]
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
              ));
            })()}
          </div>
        )}

        {/* My posts - bulk select delete */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">{t("me.myArtworks")}</h2>
          {artworks.length > 0 && profile?.id && (
            <div className="flex items-center gap-2">
              {selectMode ? (
                <>
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-sm text-zinc-600 hover:text-zinc-900"
                  >
                    {selectedIds.size >= displayedArtworks.length ? t("my.bulkSelect.clear") : t("my.bulkSelect.selectAll")}
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-sm text-zinc-600 hover:text-zinc-900"
                  >
                    {t("my.bulkSelect.clear")}
                  </button>
                  <button
                    type="button"
                    disabled={selectedIds.size === 0 || deleting}
                    onClick={() => setShowDeleteConfirm(true)}
                    className="rounded border border-red-500 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {t("my.bulkSelect.deleteSelected")} ({selectedIds.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectMode(false);
                      setSelectedIds(new Set());
                    }}
                    className="text-sm text-zinc-600 hover:text-zinc-900"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectMode(true)}
                  className="text-sm text-zinc-600 hover:text-zinc-900"
                >
                  {t("my.bulkSelect.select")}
                </button>
              )}
            </div>
          )}
        </div>

        {displayedArtworks.length === 0 ? (
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
              {displayedArtworks.map((artwork) => (
                <div key={artwork.id} className="relative">
                  {selectMode && (
                    <div className="absolute left-2 top-2 z-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(artwork.id)}
                        onChange={() => toggleSelect(artwork.id)}
                        className="h-5 w-5 rounded border-zinc-300"
                        aria-label={t("my.bulkSelect.select")}
                      />
                    </div>
                  )}
                  <ArtworkCard
                    artwork={artwork}
                    likesCount={artwork.likes_count ?? 0}
                    showEdit={!selectMode && !!profile && canEditArtwork(artwork, profile.id)}
                    showDelete={!selectMode}
                    onDelete={async (id) => {
                      const { okIds, failed } = await deleteArtworksBatch([id]);
                      if (okIds.length > 0) {
                        setToast(t("artwork.deleted"));
                        await fetchData();
                      } else if (failed.length > 0) {
                        setToast(t("my.bulkDeleteFailed"));
                      }
                    }}
                  />
                </div>
              ))}
            </div>
            {toast && (
              <div className="fixed bottom-4 right-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
                {toast}
              </div>
            )}
          </>
        )}

        {/* Delete confirm modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-w-sm rounded-lg bg-white p-6 shadow-lg">
              <p className="mb-4 text-zinc-800">
                {t("my.bulkSelect.confirmMessage").replace("{n}", String(selectedIds.size))}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={deleting}
                  className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? t("common.loading") : t("common.delete")}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AuthGate>
  );
}
