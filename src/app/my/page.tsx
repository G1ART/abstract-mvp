"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import {
  getMyProfile,
  getMyStats,
  getStatsForProfile,
  getMyPendingClaimsCount,
  listMyArtworks,
  type MyStats,
} from "@/lib/supabase/me";
import { getMyPriceInquiryCount } from "@/lib/supabase/priceInquiries";
import { getUnreadConnectionMessageCount } from "@/lib/supabase/connectionMessages";
import {
  listPublicArtworksForProfile,
  listPublicArtworksListedByProfileId,
  type ArtworkWithLikes,
} from "@/lib/supabase/artworks";
import {
  computeProfileCompleteness,
  resolveDisplayedProfileCompleteness,
} from "@/lib/profile/completeness";
import { getProfileSurface, type ProfileSurface } from "@/lib/profile/surface";
import type { Profile as FullProfile } from "@/lib/supabase/profiles";
import {
  getProfileViewsCount,
  getProfileViewers,
  type ProfileViewerRow,
} from "@/lib/supabase/profileViews";
import { getMyEntitlements, hasFeature, type Plan } from "@/lib/entitlements";
import { useActingAs } from "@/context/ActingAsContext";
import {
  listExhibitionsForProfile,
  listMyExhibitions,
  type ExhibitionWithCredits,
} from "@/lib/supabase/exhibitions";
import { getProfileById } from "@/lib/supabase/profiles";
import {
  StudioHero,
  StudioSignals,
  StudioNextActions,
  StudioSectionNav,
  StudioQuickActions,
  StudioViewsInsights,
  StudioPortfolioPanel,
  StudioIntelligenceSurface,
  type StudioSignal,
  type StudioSection,
  type QuickAction,
} from "@/components/studio";
import { computeStudioNextActions } from "@/lib/studio/priority";
import { hasAnyRole, normalizeRoleList } from "@/lib/identity/roles";
import type { PersonaTab } from "@/lib/provenance/personaTabs";

type Profile = FullProfile;

export default function MyPage() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const { actingAsProfileId } = useActingAs();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [artworks, setArtworks] = useState<ArtworkWithLikes[]>([]);
  const [exhibitions, setExhibitions] = useState<ExhibitionWithCredits[]>([]);
  const [profileViewsCount, setProfileViewsCount] = useState<number | null>(null);
  const [viewers, setViewers] = useState<ProfileViewerRow[]>([]);
  const [canViewViewers, setCanViewViewers] = useState(false);
  const [priceInquiryCount, setPriceInquiryCount] = useState(0);
  const [pendingClaimsCount, setPendingClaimsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [computedCompleteness, setComputedCompleteness] = useState<number | null>(null);
  const [, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const initialTab: PersonaTab = searchParams.get("tab") === "exhibitions" ? "exhibitions" : "all";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const effectiveProfileId = actingAsProfileId ?? null;
    try {
      const [profileRes, statsRes, artworksRes, entRes] = await Promise.all([
        effectiveProfileId ? getProfileById(effectiveProfileId) : getMyProfile(),
        effectiveProfileId ? getStatsForProfile(effectiveProfileId) : getMyStats(),
        effectiveProfileId
          ? listPublicArtworksForProfile(effectiveProfileId, { limit: 50 })
          : listMyArtworks({ limit: 50, publicOnly: true }),
        getMyEntitlements(),
      ]);

      if (profileRes.error) {
        setError(
          profileRes.error instanceof Error ? profileRes.error.message : t("my.errorLoadProfile")
        );
        return;
      }
      if (statsRes.error) {
        setError(
          statsRes.error instanceof Error ? statsRes.error.message : t("my.errorLoadStats")
        );
        return;
      }

      const profileData = profileRes.data as Profile | null;
      setProfile(profileData);
      setStats(statsRes.data ?? null);

      let mergedArtworks = artworksRes.data ?? [];
      if (!effectiveProfileId && profileData?.id) {
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
      }
      mergedArtworks = [...mergedArtworks].sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      );
      setArtworks(mergedArtworks);

      const canView = hasFeature(entRes.plan as Plan, "VIEW_PROFILE_VIEWERS_LIST");
      setCanViewViewers(canView);

      if (profileData) {
        const surface = getProfileSurface(profileData);
        if (surface) {
          const { score } = computeProfileCompleteness(
            {
              username: surface.username,
              display_name: surface.displayName,
              avatar_url: surface.avatarUrl,
              bio: surface.bio,
              main_role: surface.mainRole,
              roles: [...surface.roles],
              city: surface.details.city,
              region: surface.details.region,
              country: surface.details.country,
              themes: [...surface.details.themes],
              mediums: [...surface.details.mediums],
              styles: [...surface.details.styles],
              keywords: [...surface.details.keywords],
              price_band: surface.details.price_band,
              acquisition_channels: [...surface.details.acquisition_channels],
              affiliation: surface.details.affiliation,
              program_focus: [...surface.details.program_focus],
              education: profileData.education ?? null,
            },
            { hasDetailsLoaded: true }
          );
          setComputedCompleteness(
            resolveDisplayedProfileCompleteness(profileData, score)
          );
        } else {
          setComputedCompleteness(null);
        }
      } else {
        setComputedCompleteness(null);
      }

      if (profileData?.id) {
        const [countRes, viewersRes, inquiryCountRes, claimsCountRes, messagesUnread] =
          await Promise.all([
            getProfileViewsCount(profileData.id, 7),
            canView
              ? getProfileViewers(profileData.id, { limit: 10 })
              : { data: [], nextCursor: null, error: null },
            getMyPriceInquiryCount(effectiveProfileId ?? undefined),
            getMyPendingClaimsCount(effectiveProfileId ?? undefined),
            effectiveProfileId ? Promise.resolve(0) : getUnreadConnectionMessageCount(),
          ]);
        setProfileViewsCount(countRes.data);
        setViewers(Array.isArray(viewersRes.data) ? viewersRes.data : []);
        setPriceInquiryCount(inquiryCountRes.data ?? 0);
        setPendingClaimsCount(claimsCountRes.data ?? 0);
        setUnreadMessagesCount(messagesUnread ?? 0);
        if (effectiveProfileId) {
          const { data: exData } = await listExhibitionsForProfile(profileData.id);
          setExhibitions(
            (exData ?? []).sort(
              (a, b) =>
                new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
            )
          );
        } else {
          const [exProfileRes, exMineRes] = await Promise.all([
            listExhibitionsForProfile(profileData.id),
            listMyExhibitions(),
          ]);
          const fromProfile = exProfileRes.data ?? [];
          const fromMine = exMineRes.data ?? [];
          const byId = new Map<string, ExhibitionWithCredits>();
          for (const e of fromProfile) byId.set(e.id, e);
          for (const e of fromMine) if (!byId.has(e.id)) byId.set(e.id, e);
          const merged = Array.from(byId.values()).sort(
            (a, b) =>
              new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
          );
          setExhibitions(merged);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.errorOccurred"));
    } finally {
      setLoading(false);
    }
  }, [actingAsProfileId, t]);

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

  const profileSurface = useMemo<ProfileSurface | null>(
    () => getProfileSurface(profile),
    [profile]
  );

  const studioSignals = useMemo<StudioSignal[]>(() => {
    if (!profile) return [];
    const out: StudioSignal[] = [];
    if (!actingAsProfileId) {
      out.push({
        key: "views",
        label: t("studio.signals.views7d"),
        value: canViewViewers && profileViewsCount != null ? profileViewsCount : "—",
        tone: canViewViewers ? "default" : "locked",
        hint: canViewViewers ? null : t("studio.signals.lockedUpsell"),
      });
    }
    out.push({
      key: "followers",
      label: t("studio.signals.followerDelta"),
      value: stats?.followersCount ?? 0,
    });
    out.push({
      key: "inquiries",
      label: t("studio.signals.unreadInquiries"),
      value: priceInquiryCount,
      tone: priceInquiryCount > 0 ? "warning" : "default",
    });
    out.push({
      key: "claims",
      label: t("studio.signals.pendingClaims"),
      value: pendingClaimsCount,
      tone: pendingClaimsCount > 0 ? "warning" : "default",
    });
    return out;
  }, [
    profile,
    actingAsProfileId,
    canViewViewers,
    profileViewsCount,
    stats?.followersCount,
    priceInquiryCount,
    pendingClaimsCount,
    t,
  ]);

  const studioActions = useMemo(() => {
    if (!profile) return [];
    return computeStudioNextActions({
      profileCompleteness: computedCompleteness,
      artworkCount: artworks.length,
      pendingClaimsCount,
      priceInquiryCount,
      unreadInbox: priceInquiryCount,
      hasAvatar: !!profile.avatar_url,
      hasRoles: hasAnyRole({ main_role: profile.main_role, roles: profile.roles }),
      hasExhibitions: exhibitions.length > 0,
      t,
    });
  }, [
    profile,
    computedCompleteness,
    artworks.length,
    pendingClaimsCount,
    priceInquiryCount,
    exhibitions.length,
    t,
  ]);

  const studioSections = useMemo<StudioSection[]>(
    () => [
      {
        key: "portfolio",
        labelKey: "studio.sections.portfolio",
        href: "/my",
        count: artworks.length,
      },
      {
        key: "exhibitions",
        labelKey: "studio.sections.exhibitions",
        href: "/my/exhibitions",
        count: exhibitions.length,
      },
      {
        key: "inbox",
        labelKey: "studio.sections.inbox",
        href: "/my/inquiries",
        count: priceInquiryCount,
        badge: priceInquiryCount > 0 ? String(priceInquiryCount) : null,
      },
      {
        key: "messages",
        labelKey: "connection.inbox.title",
        href: "/my/messages",
        count: unreadMessagesCount,
        badge: unreadMessagesCount > 0 ? String(unreadMessagesCount) : null,
      },
      {
        key: "network",
        labelKey: "studio.sections.network",
        href: "/my/followers",
        count: stats?.followersCount ?? 0,
      },
      {
        key: "operations",
        labelKey: "studio.sections.operations",
        href: "/my/claims",
        count: pendingClaimsCount,
        badge: pendingClaimsCount > 0 ? String(pendingClaimsCount) : null,
      },
    ],
    [artworks.length, exhibitions.length, priceInquiryCount, unreadMessagesCount, stats?.followersCount, pendingClaimsCount]
  );

  const quickActions = useMemo<QuickAction[]>(() => {
    if (!profile) return [];
    const out: QuickAction[] = [
      { key: "upload", label: t("studio.quickActions.upload"), href: "/upload", tone: "primary" },
      { key: "exhibition", label: t("studio.quickActions.exhibition"), href: "/my/exhibitions" },
    ];
    if (!actingAsProfileId) {
      out.push({ key: "library", label: t("studio.quickActions.library"), href: "/my/library" });
    }
    const roleSet = new Set(normalizeRoleList(profile.roles));
    if (roleSet.has("curator") || roleSet.has("collector")) {
      out.push({ key: "shortlists", label: t("studio.quickActions.shortlists"), href: "/my/shortlists" });
      out.push({ key: "alerts", label: t("studio.quickActions.alerts"), href: "/my/alerts" });
    }
    out.push({ key: "people", label: t("studio.quickActions.findPeople"), href: "/people" });
    if (profile.username) {
      out.push({
        key: "reorder",
        label: t("studio.quickActions.reorder"),
        href: `/u/${profile.username}?mode=reorder`,
      });
    } else {
      out.push({
        key: "complete",
        label: t("studio.quickActions.completeProfile"),
        href: "/onboarding",
      });
    }
    return out;
  }, [profile, actingAsProfileId, t]);

  return (
    <AuthGate>
      <main className="mx-auto max-w-4xl px-4 py-8">
        {profile && !actingAsProfileId && (
          <>
            <StudioHero
              profile={profile}
              completeness={computedCompleteness}
              publicHref={profile.username ? `/u/${profile.username}` : null}
            />
            <StudioSignals signals={studioSignals} />
            <StudioNextActions actions={studioActions} />
            <StudioSectionNav sections={studioSections} />
            <StudioQuickActions actions={quickActions} />
            <StudioViewsInsights
              count={profileViewsCount}
              canViewViewers={canViewViewers}
              viewers={viewers}
            />
          </>
        )}

        {profile && (
          <StudioPortfolioPanel
            profile={profile}
            artworks={artworks}
            exhibitions={exhibitions}
            initialTab={initialTab}
            canSaveTabOrder={!actingAsProfileId}
            onRefresh={fetchData}
            onToast={setToast}
          />
        )}

        {profileSurface && !actingAsProfileId && (
          <StudioIntelligenceSurface
            profileSurface={profileSurface}
            completeness={computedCompleteness}
            artworks={artworks}
            exhibitions={exhibitions}
            stats={stats}
            viewsCount7d={profileViewsCount}
            inquiries7d={priceInquiryCount}
          />
        )}

        {toast && (
          <div className="fixed bottom-4 right-4 rounded-2xl bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        )}
      </main>
    </AuthGate>
  );
}
