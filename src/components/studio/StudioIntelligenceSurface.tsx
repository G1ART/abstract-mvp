"use client";

import { useMemo } from "react";
import { useT } from "@/lib/i18n/useT";
import { ProfileCopilotCard } from "./intelligence/ProfileCopilotCard";
import { PortfolioCopilotCard } from "./intelligence/PortfolioCopilotCard";
import { WeeklyDigestCard } from "./intelligence/WeeklyDigestCard";
import { MatchmakerCard } from "./intelligence/MatchmakerCard";
import type { ArtworkWithLikes } from "@/lib/supabase/artworks";
import type { ExhibitionWithCredits } from "@/lib/supabase/exhibitions";
import type { ProfileSurface } from "@/lib/profile/surface";

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

  const portfolioInput = useMemo(
    () => ({
      username: profileSurface.username,
      artworks: artworks.slice(0, 20).map((a) => ({
        id: a.id,
        title: a.title ?? null,
        year: (a as Record<string, unknown>).year as string | number | null | undefined ?? null,
        medium: (a as Record<string, unknown>).medium as string | null | undefined ?? null,
        dimensions: (a as Record<string, unknown>).dimensions as string | null | undefined ?? null,
      })),
      exhibitions: exhibitions.slice(0, 10).map((e) => ({
        id: e.id,
        title: e.title ?? null,
        year: (e as Record<string, unknown>).year as string | number | null | undefined ?? null,
        venue: (e as Record<string, unknown>).venue as string | null | undefined ?? null,
      })),
    }),
    [profileSurface.username, artworks, exhibitions],
  );

  const digestInput = useMemo(
    () => ({
      views7d: viewsCount7d ?? 0,
      inquiries7d,
      recentExhibitions: exhibitions.slice(0, 3).map((e) => ({
        title: e.title ?? "",
      })),
      locale,
    }),
    [viewsCount7d, inquiries7d, exhibitions, locale],
  );

  const matchmakerMe = useMemo(
    () => ({ themes, mediums, city }),
    [themes, mediums, city],
  );

  return (
    <section
      aria-labelledby="studio-intelligence-title"
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
      />
      <WeeklyDigestCard digestInput={digestInput} />
      <MatchmakerCard me={matchmakerMe} />
    </section>
  );
}
