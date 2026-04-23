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
import { resolveEntitlementFor } from "@/lib/entitlements";
import { supabase } from "@/lib/supabase/client";
import { useActingAs } from "@/context/ActingAsContext";
import {
  listExhibitionsForProfile,
  listMyExhibitions,
  type ExhibitionWithCredits,
} from "@/lib/supabase/exhibitions";
import { getProfileById } from "@/lib/supabase/profiles";
import { getBoardSaveSignals, type BoardSaveSignal } from "@/lib/supabase/shortlists";
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
  const [boardSaveSignal, setBoardSaveSignal] = useState<BoardSaveSignal | null>(null);
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
      // Resolve `insights.profile_viewer_identity` up-front: it controls
      // whether the studio viewer-identity list is populated at all and is
      // referenced by several downstream queries below.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;
      const [profileRes, statsRes, artworksRes, viewerIdentityDecision] = await Promise.all([
        effectiveProfileId ? getProfileById(effectiveProfileId) : getMyProfile(),
        effectiveProfileId ? getStatsForProfile(effectiveProfileId) : getMyStats(),
        effectiveProfileId
          ? listPublicArtworksForProfile(effectiveProfileId, { limit: 50 })
          : listMyArtworks({ limit: 50, publicOnly: true }),
        resolveEntitlementFor({
          featureKey: "insights.profile_viewer_identity",
          userId,
          skipQuotaCheck: true,
        }),
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

      const canView = viewerIdentityDecision.allowed;
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
        const [countRes, viewersRes, inquiryCountRes, claimsCountRes, messagesUnread, boardSignalRes] =
          await Promise.all([
            getProfileViewsCount(profileData.id, 7),
            canView
              ? getProfileViewers(profileData.id, { limit: 10 })
              : { data: [], nextCursor: null, error: null },
            getMyPriceInquiryCount(effectiveProfileId ?? undefined),
            getMyPendingClaimsCount(effectiveProfileId ?? undefined),
            effectiveProfileId ? Promise.resolve(0) : getUnreadConnectionMessageCount(),
            // Only meaningful for the authenticated user's own artwork set.
            // When acting-as a gallery, suppress to avoid leaking wrong
            // scope; the signal is scoped to auth.uid()'s works regardless.
            effectiveProfileId
              ? Promise.resolve({ data: { boards_count: 0, savers_count: 0 }, error: null })
              : getBoardSaveSignals(),
          ]);
        setProfileViewsCount(countRes.data);
        setViewers(Array.isArray(viewersRes.data) ? viewersRes.data : []);
        setPriceInquiryCount(inquiryCountRes.data ?? 0);
        setPendingClaimsCount(claimsCountRes.data ?? 0);
        setUnreadMessagesCount(messagesUnread ?? 0);
        setBoardSaveSignal(boardSignalRes.data ?? null);
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
      label: t("studio.signals.followers"),
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
    // Artist-side "who's collecting my works" signal. Only surfaced when
    // someone has actually saved at least once — keeps the 4-tile grid
    // visually clean for new accounts and only surfaces real signal.
    if (
      !actingAsProfileId &&
      artworks.length > 0 &&
      boardSaveSignal &&
      boardSaveSignal.boards_count > 0
    ) {
      const { boards_count, savers_count } = boardSaveSignal;
      out.push({
        key: "boards_saved_in",
        label: t("studio.signals.boardsSavedIn"),
        value: boards_count,
        hint: t("studio.signals.boardsSavedInHint").replace("{n}", String(savers_count)),
      });
    }
    return out;
  }, [
    profile,
    actingAsProfileId,
    canViewViewers,
    profileViewsCount,
    stats?.followersCount,
    priceInquiryCount,
    pendingClaimsCount,
    boardSaveSignal,
    artworks.length,
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
        key: "workshop",
        labelKey: "studio.sections.workshop",
        descKey: "studio.sections.workshopDesc",
        href: "/my/library",
        count: artworks.length,
      },
      {
        key: "exhibitions",
        labelKey: "studio.sections.exhibitions",
        descKey: "studio.sections.exhibitionsDesc",
        href: "/my/exhibitions",
        count: exhibitions.length,
      },
      {
        key: "inbox",
        labelKey: "studio.sections.inbox",
        descKey: "studio.sections.inboxDesc",
        href: "/my/inquiries",
        count: priceInquiryCount,
        badge: priceInquiryCount > 0 ? String(priceInquiryCount) : null,
      },
      {
        key: "messages",
        labelKey: "studio.sections.messages",
        descKey: "studio.sections.messagesDesc",
        href: "/my/messages",
        count: unreadMessagesCount,
        badge: unreadMessagesCount > 0 ? String(unreadMessagesCount) : null,
      },
      {
        key: "network",
        labelKey: "studio.sections.network",
        descKey: "studio.sections.networkDesc",
        href: "/my/followers",
        count: stats?.followersCount ?? 0,
      },
      {
        key: "operations",
        labelKey: "studio.sections.operations",
        descKey: "studio.sections.operationsDesc",
        href: "/my/claims",
        count: pendingClaimsCount,
        badge: pendingClaimsCount > 0 ? String(pendingClaimsCount) : null,
      },
      {
        key: "boards",
        labelKey: "studio.sections.boards",
        descKey: "studio.sections.boardsDesc",
        href: "/my/shortlists",
        count: null,
      },
    ],
    [artworks.length, exhibitions.length, priceInquiryCount, unreadMessagesCount, stats?.followersCount, pendingClaimsCount]
  );

  // Quick actions follow a strict 3-tier hierarchy (see StudioQuickActions):
  //   primary   — one filled CTA
  //   secondary — 2-3 outlined high-frequency destinations
  //   tertiary  — hidden under "더 보기"
  const quickActions = useMemo<QuickAction[]>(() => {
    if (!profile) return [];
    const out: QuickAction[] = [
      { key: "upload", label: t("studio.quickActions.upload"), href: "/upload", tone: "primary" },
      { key: "exhibition", label: t("studio.quickActions.exhibition"), href: "/my/exhibitions/new", tone: "secondary" },
      { key: "editProfile", label: t("studio.quickActions.editProfile"), href: "/settings", tone: "secondary" },
      { key: "people", label: t("studio.quickActions.findPeople"), href: "/people", tone: "secondary" },
    ];
    // Tertiary (overflow). These duplicate some section-nav entries by design:
    // section nav explains "where things live", the overflow gives fast access.
    if (!actingAsProfileId) {
      out.push({ key: "library", label: t("studio.quickActions.library"), href: "/my/library", tone: "tertiary" });
      out.push({ key: "shortlists", label: t("studio.quickActions.shortlists"), href: "/my/shortlists", tone: "tertiary" });
    }
    const roleSet = new Set(normalizeRoleList(profile.roles));
    if (roleSet.has("curator") || roleSet.has("collector")) {
      out.push({ key: "alerts", label: t("studio.quickActions.alerts"), href: "/my/alerts", tone: "tertiary" });
    }
    if (profile.username) {
      out.push({
        key: "reorder",
        label: t("studio.quickActions.reorder"),
        href: `/u/${profile.username}?mode=reorder`,
        tone: "tertiary",
      });
    } else {
      out.push({
        key: "complete",
        label: t("studio.quickActions.completeProfile"),
        href: "/onboarding",
        tone: "tertiary",
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
              followersCount={stats?.followersCount ?? 0}
              followingCount={stats?.followingCount ?? 0}
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

        {profile && !actingAsProfileId && (
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/60 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-800">
                {t("studio.portfolioHelper.title")}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {t("studio.portfolioHelper.desc")}
              </p>
            </div>
            <a
              href="/my/library"
              className="shrink-0 text-xs font-medium text-zinc-700 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              {t("studio.portfolioHelper.workshopLink")}
            </a>
          </div>
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
