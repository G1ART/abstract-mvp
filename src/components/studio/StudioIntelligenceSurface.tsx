"use client";

import { useMemo } from "react";
import { useT } from "@/lib/i18n/useT";
import { ProfileCopilotCard } from "./intelligence/ProfileCopilotCard";
import { PortfolioCopilotCard } from "./intelligence/PortfolioCopilotCard";
import { WeeklyDigestCard } from "./intelligence/WeeklyDigestCard";
import { MatchmakerCard } from "./intelligence/MatchmakerCard";
import type { PortfolioMetadataGaps } from "@/lib/ai/types";
import type { ArtworkWithLikes } from "@/lib/supabase/artworks";
import type { ExhibitionWithCredits } from "@/lib/supabase/exhibitions";
import type { ProfileSurface } from "@/lib/profile/surface";

function computePortfolioMetadataGaps(artworks: ArtworkWithLikes[]): PortfolioMetadataGaps {
  const g: PortfolioMetadataGaps = {
    missing_title: 0,
    missing_year: 0,
    missing_medium: 0,
    missing_size: 0,
    no_image: 0,
    drafts_not_public: 0,
  };
  for (const a of artworks) {
    if (a.visibility !== "public") g.drafts_not_public += 1;
    if (!a.title?.trim()) g.missing_title += 1;
    if (a.year == null) g.missing_year += 1;
    if (!a.medium?.trim()) g.missing_medium += 1;
    if (!a.size?.trim()) g.missing_size += 1;
    if (!a.artwork_images?.length) g.no_image += 1;
  }
  return g;
}

type Stats = {
  artworkCount?: number | null;
  exhibitionCount?: number | null;
  followersCount?: number | null;
};

type Props = {
  /**
   * Typed profile surface (see `src/lib/profile/surface.ts`). The page owner
   * is responsible for calling `getProfileSurface(profile)` once and passing
   * the result here so this component never reaches into `profile_details`
   * blobs directly. Intelligence consumers read ONLY from allow-listed
   * surface fields — anything else lives in legacy JSON we do not surface.
   */
  profileSurface: ProfileSurface;
  completeness: number | null;
  artworks: ArtworkWithLikes[];
  exhibitions: ExhibitionWithCredits[];
  stats: Stats | null;
  viewsCount7d: number | null;
  inquiries7d: number;
};

/**
 * Studio intelligence area. Composes ProfileCopilot, PortfolioCopilot,
 * WeeklyDigest and Matchmaker into the single container the brief
 * specifies. Cards are strictly preview/edit — no AI action runs without
 * the user pressing a button, and no result is persisted without a
 * separate human confirmation.
 */
export function StudioIntelligenceSurface({
  profileSurface,
  completeness,
  artworks,
  exhibitions,
  stats,
  viewsCount7d,
  inquiries7d,
}: Props) {
  const { t, locale } = useT();

  const themes = useMemo(() => [...profileSurface.details.themes], [profileSurface.details.themes]);
  const mediums = useMemo(() => [...profileSurface.details.mediums], [profileSurface.details.mediums]);
  const city = profileSurface.details.city;

  const profileInput = useMemo(
    () => ({
      display_name: profileSurface.displayName,
      username: profileSurface.username,
      role: profileSurface.mainRole,
      bio: profileSurface.bio,
      themes,
      mediums,
      city,
      locale,
      counts: {
        artworks: artworks.length,
        exhibitions: exhibitions.length,
        followers: stats?.followersCount ?? 0,
        views7d: viewsCount7d ?? 0,
      },
    }),
    [profileSurface, themes, mediums, city, artworks.length, exhibitions.length, stats?.followersCount, viewsCount7d, locale],
  );

  const portfolioMetadataGaps = useMemo(
    () => computePortfolioMetadataGaps(artworks),
    [artworks],
  );

  const portfolioInput = useMemo(
    () => ({
      username: profileSurface.username,
      artworks: artworks.slice(0, 20).map((a) => ({
        id: a.id,
        title: a.title ?? null,
        year: (a as Record<string, unknown>).year as string | number | null | undefined ?? null,
        medium: (a as Record<string, unknown>).medium as string | null | undefined ?? null,
        /** `Artwork` stores physical size as `size`; keep aligned for portfolio copilot context. */
        dimensions: a.size ?? null,
      })),
      exhibitions: exhibitions.slice(0, 10).map((e) => ({
        id: e.id,
        title: e.title ?? null,
        year: (e as Record<string, unknown>).year as string | number | null | undefined ?? null,
        venue: (e as Record<string, unknown>).venue as string | null | undefined ?? null,
      })),
      metadataGaps: portfolioMetadataGaps,
      locale,
    }),
    [profileSurface.username, artworks, exhibitions, portfolioMetadataGaps, locale],
  );

  const draftsNotPublicCount = useMemo(
    () => artworks.filter((a) => a.visibility !== "public").length,
    [artworks],
  );

  const incompleteMetadataCount = useMemo(
    () =>
      artworks.filter((a) => {
        const noImg = !a.artwork_images?.length;
        const noTitle = !a.title?.trim();
        const noYear = a.year == null;
        const noMed = !a.medium?.trim();
        const noSize = !a.size?.trim();
        return noImg || noTitle || noYear || noMed || noSize;
      }).length,
    [artworks],
  );

  const digestInput = useMemo(
    () => ({
      username: profileSurface.username,
      views7d: viewsCount7d ?? 0,
      inquiries7d,
      draftsNotPublicCount,
      incompleteMetadataCount,
      recentExhibitions: exhibitions.slice(0, 3).map((e) => ({
        title: e.title ?? "",
      })),
      recentUploads: artworks.slice(0, 3).map((a) => ({
        id: a.id,
        title: a.title ?? null,
        createdAt:
          (a as Record<string, unknown>).created_at as string | null | undefined ?? null,
      })),
      locale,
    }),
    [
      profileSurface.username,
      viewsCount7d,
      inquiries7d,
      draftsNotPublicCount,
      incompleteMetadataCount,
      exhibitions,
      artworks,
      locale,
    ],
  );

  const matchmakerMe = useMemo(
    () => ({
      themes,
      mediums,
      city,
      artworks: artworks.slice(0, 10).map((a) => ({
        id: a.id,
        title: a.title ?? null,
      })),
    }),
    [themes, mediums, city, artworks],
  );

  const artworkTitles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of artworks) {
      if (a.id && a.title) map[a.id] = a.title;
    }
    return map;
  }, [artworks]);

  return (
    <section
      aria-labelledby="studio-intelligence-title"
      data-tour="studio-ai-helpers"
      className="mb-6 flex flex-col gap-3"
    >
      <header className="flex items-baseline justify-between gap-3">
        <p
          id="studio-intelligence-title"
          className="text-[11px] font-medium uppercase tracking-wide text-zinc-500"
        >
          {t("studio.intelligence.title")}
        </p>
        <p
          className="text-[11px] text-zinc-500"
          title={t("ai.disclosure.tooltip")}
        >
          {t("ai.disclosure.tooltip")}
        </p>
      </header>

      <ProfileCopilotCard
        completeness={completeness}
        profileInput={profileInput}
      />
      <PortfolioCopilotCard
        portfolioInput={portfolioInput}
        artworkCount={artworks.length}
        artworkTitles={artworkTitles}
      />
      <WeeklyDigestCard
        digestInput={digestInput}
        backlogDrafts={draftsNotPublicCount}
        backlogIncomplete={incompleteMetadataCount}
      />
      <MatchmakerCard me={matchmakerMe} myArtworkTitles={artworkTitles} />
    </section>
  );
}
