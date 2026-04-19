"use client";

import { useMemo } from "react";
import { useT } from "@/lib/i18n/useT";
import { ProfileCopilotCard } from "./intelligence/ProfileCopilotCard";
import { PortfolioCopilotCard } from "./intelligence/PortfolioCopilotCard";
import { WeeklyDigestCard } from "./intelligence/WeeklyDigestCard";
import { MatchmakerCard } from "./intelligence/MatchmakerCard";
import type { ArtworkWithLikes } from "@/lib/supabase/artworks";
import type { ExhibitionWithCredits } from "@/lib/supabase/exhibitions";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  main_role: string | null;
  roles: string[] | null;
  profile_completeness?: number | null;
  profile_details?: Record<string, unknown> | null;
  bio?: string | null;
};

type Stats = {
  artworkCount?: number | null;
  exhibitionCount?: number | null;
  followersCount?: number | null;
};

type Props = {
  profile: Profile;
  completeness: number | null;
  artworks: ArtworkWithLikes[];
  exhibitions: ExhibitionWithCredits[];
  stats: Stats | null;
  viewsCount7d: number | null;
  inquiries7d: number;
};

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === "string") {
      const s = v.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * Studio intelligence area. Composes ProfileCopilot, PortfolioCopilot,
 * WeeklyDigest and Matchmaker into the single container the brief
 * specifies. Cards are strictly preview/edit — no AI action runs without
 * the user pressing a button, and no result is persisted without a
 * separate human confirmation.
 */
export function StudioIntelligenceSurface({
  profile,
  completeness,
  artworks,
  exhibitions,
  stats,
  viewsCount7d,
  inquiries7d,
}: Props) {
  const { t } = useT();

  const details = (profile.profile_details ?? {}) as Record<string, unknown>;
  const themes = toStringArray(details.themes ?? (profile as Record<string, unknown>).themes);
  const mediums = toStringArray(details.mediums ?? (profile as Record<string, unknown>).mediums);
  const city =
    typeof details.city === "string"
      ? (details.city as string)
      : typeof (profile as Record<string, unknown>).city === "string"
        ? ((profile as Record<string, unknown>).city as string)
        : null;

  const profileInput = useMemo(
    () => ({
      display_name: profile.display_name,
      username: profile.username,
      role: profile.main_role,
      bio: profile.bio ?? (details.bio as string | undefined) ?? null,
      themes,
      mediums,
      city,
      locale: "ko",
      counts: {
        artworks: artworks.length,
        exhibitions: exhibitions.length,
        followers: stats?.followersCount ?? 0,
        views7d: viewsCount7d ?? 0,
      },
    }),
    [profile, details.bio, themes, mediums, city, artworks.length, exhibitions.length, stats?.followersCount, viewsCount7d],
  );

  const portfolioInput = useMemo(
    () => ({
      username: profile.username,
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
    [profile.username, artworks, exhibitions],
  );

  const digestInput = useMemo(
    () => ({
      views7d: viewsCount7d ?? 0,
      inquiries7d,
      recentExhibitions: exhibitions.slice(0, 3).map((e) => ({
        title: e.title ?? "",
      })),
      locale: "ko",
    }),
    [viewsCount7d, inquiries7d, exhibitions],
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
