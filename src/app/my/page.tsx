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
import { getProfileViewsCount } from "@/lib/supabase/profileViews";
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
  StudioHeroPanel,
  StudioNextStepsRail,
  StudioOperationGrid,
  StudioQuickActions,
  StudioPortfolioPanel,
  StudioIntelligenceSurface,
  type OperationTile,
  type QuickAction,
} from "@/components/studio";
import { computeStudioNextActions } from "@/lib/studio/priority";
import { TourTrigger, TourHelpButton } from "@/components/tour";
import { TOUR_IDS } from "@/lib/tours/tourRegistry";
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
        const [countRes, inquiryCountRes, claimsCountRes, messagesUnread, boardSignalRes] =
          await Promise.all([
            getProfileViewsCount(profileData.id, 7),
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

  // Brief §3 Section 2 — 8 tiles in a strict 2×4 layout.
  //   Row 1 (creation / curation / active operation): 전시 · 작업실 · 보드 · 메시지
  //   Row 2 (relationship / requests / verification / visibility): 문의 · 소유권 · 네트워크 · 프로필 조회
  const operationTiles = useMemo<OperationTile[]>(() => {
    const boardsCount = boardSaveSignal?.boards_count ?? null;
    const tiles: OperationTile[] = [
      {
        key: "exhibitions",
        labelKey: "studio.sections.exhibitions",
        descKey: "studio.sections.exhibitionsDesc",
        href: "/my/exhibitions",
        value: exhibitions.length,
        dataTour: "studio-card-exhibitions",
      },
      {
        key: "workshop",
        // `stats.artworksCount` counts every artwork where the caller is
        // `artist_id` regardless of visibility. This is the same scope
        // /my/library lists (default visibility="all"), so the tile and
        // the page can never disagree. The local `artworks` array is a
        // merged public + claim-listed set used for the portfolio panel
        // and is intentionally not used for this counter.
        labelKey: "studio.sections.workshop",
        descKey: "studio.sections.workshopDesc",
        href: "/my/library",
        value: stats?.artworksCount ?? 0,
        dataTour: "studio-card-workshop",
      },
      {
        key: "boards",
        labelKey: "studio.sections.boards",
        descKey: "studio.sections.boardsDesc",
        href: "/my/shortlists",
        value: boardsCount,
        valueLabel: boardsCount == null ? "—" : undefined,
        dataTour: "studio-card-boards",
      },
      {
        key: "messages",
        labelKey: "studio.sections.messages",
        descKey: "studio.sections.messagesDesc",
        href: "/my/messages",
        value: unreadMessagesCount,
        badge: unreadMessagesCount > 0 ? String(unreadMessagesCount) : null,
        dataTour: "studio-card-messages",
      },
      {
        key: "inbox",
        labelKey: "studio.sections.inbox",
        descKey: "studio.sections.inboxDesc",
        href: "/my/inquiries",
        value: priceInquiryCount,
        badge: priceInquiryCount > 0 ? String(priceInquiryCount) : null,
      },
      {
        key: "operations",
        labelKey: "studio.sections.operations",
        descKey: "studio.sections.operationsDesc",
        href: "/my/claims",
        value: pendingClaimsCount,
        badge: pendingClaimsCount > 0 ? String(pendingClaimsCount) : null,
      },
      {
        key: "network",
        // The network page holds both followers and following in one
        // place, so the tile surfaces a composite "followers · following"
        // glyph (e.g. "9 · 12"). The subtitle already reads "팔로워와
        // 팔로잉" / "Followers and following", so the ordering is
        // self-explanatory without extra copy.
        labelKey: "studio.sections.network",
        descKey: "studio.sections.networkDesc",
        href: "/my/network",
        value: stats?.followersCount ?? 0,
        valueLabel: `${stats?.followersCount ?? 0} · ${stats?.followingCount ?? 0}`,
      },
      {
        key: "views",
        labelKey: "studio.sections.views",
        descKey: "studio.sections.viewsDesc",
        // The settings page hosts the full viewer roster today; keeping
        // the tile clickable preserves the action-oriented intent of the
        // grid even when the viewer identity is entitlement-locked.
        href: "/settings",
        value: canViewViewers ? profileViewsCount : null,
        valueLabel: canViewViewers ? undefined : "—",
        locked: !canViewViewers,
      },
    ];
    return tiles;
  }, [
    exhibitions.length,
    priceInquiryCount,
    unreadMessagesCount,
    stats?.artworksCount,
    stats?.followersCount,
    stats?.followingCount,
    pendingClaimsCount,
    boardSaveSignal,
    canViewViewers,
    profileViewsCount,
  ]);

  // Quick actions strip — Brief §3 Section 3. Deliberately compact:
  //   primary   — one filled CTA (upload)
  //   secondary — 2-3 outlined high-frequency destinations
  //   tertiary  — hidden under "더 보기" (lower-frequency tools)
  const quickActions = useMemo<QuickAction[]>(() => {
    if (!profile) return [];
    const out: QuickAction[] = [
      { key: "upload", label: t("studio.quickActions.upload"), href: "/upload", tone: "primary" },
      { key: "exhibition", label: t("studio.quickActions.exhibition"), href: "/my/exhibitions/new", tone: "secondary" },
      { key: "editProfile", label: t("studio.quickActions.editProfile"), href: "/settings", tone: "secondary" },
      { key: "people", label: t("studio.quickActions.findPeople"), href: "/people", tone: "secondary" },
    ];
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
  }, [profile, t]);

  return (
    <AuthGate>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {profile && !actingAsProfileId ? <TourTrigger tourId={TOUR_IDS.studio} /> : null}
        {profile && !actingAsProfileId ? (
          <div className="mb-3 flex items-center justify-end">
            <TourHelpButton tourId={TOUR_IDS.studio} />
          </div>
        ) : null}
        {profile && !actingAsProfileId && (
          <>
            <StudioHeroPanel
              hero={
                <StudioHero
                  profile={profile}
                  completeness={computedCompleteness}
                  publicHref={profile.username ? `/u/${profile.username}` : null}
                  followersCount={stats?.followersCount ?? 0}
                  followingCount={stats?.followingCount ?? 0}
                />
              }
              rail={<StudioNextStepsRail actions={studioActions} />}
            />
            <StudioOperationGrid tiles={operationTiles} />
            <StudioQuickActions actions={quickActions} />
          </>
        )}

        {profile && !actingAsProfileId && (
          <div
            data-tour="studio-public-works"
            className="mb-3 flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/60 px-4 py-3"
          >
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
