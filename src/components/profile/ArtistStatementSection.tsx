"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";

type Props = {
  statement: string | null | undefined;
  heroImagePath: string | null | undefined;
  isOwner: boolean;
  /** Where the owner's "write statement" CTA links to. Defaults to /settings#statement. */
  ownerEditHref?: string;
};

const READ_MORE_THRESHOLD = 480;

function resolveHero(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return getArtworkImageUrl(path, "medium");
}

/**
 * Section-card rendering of an artist statement, placed above the studio
 * tab strip on the public profile page (per audit decision: avoid taking
 * a tab slot, since `buildStudioStripTabs` is fragile to new entrants).
 *
 * Visitors: hidden when no statement.
 * Owner with no statement: shows a small write prompt and CTA.
 */
export function ArtistStatementSection({
  statement,
  heroImagePath,
  isOwner,
  ownerEditHref = "/settings#statement",
}: Props) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);

  const trimmed = (statement ?? "").trim();
  const hasStatement = trimmed.length > 0;

  if (!hasStatement) {
    if (!isOwner) return null;
    return (
      <section className="mb-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-800">
          {t("profile.statement.title")}
        </h2>
        <p className="mb-3 text-sm text-zinc-600">
          {t("profile.statement.ownerPrompt")}
        </p>
        <Link
          href={ownerEditHref}
          className="inline-flex items-center rounded border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
        >
          {t("profile.statement.ownerCta")}
        </Link>
      </section>
    );
  }

  const isLong = trimmed.length > READ_MORE_THRESHOLD;
  const visibleText: ReactNode = isLong && !expanded ? `${trimmed.slice(0, READ_MORE_THRESHOLD)}…` : trimmed;

  return (
    <section className="mb-6 rounded-xl border border-zinc-200 bg-white px-4 py-5">
      <h2 className="mb-3 text-sm font-semibold text-zinc-800">
        {t("profile.statement.title")}
      </h2>
      {heroImagePath && (
        <div className="relative mb-3 aspect-[16/9] w-full overflow-hidden rounded-md bg-zinc-100">
          <Image
            src={resolveHero(heroImagePath)}
            alt={t("profile.statement.heroAlt")}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>
      )}
      <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-800">
        {visibleText}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-zinc-500 underline hover:text-zinc-800"
        >
          {expanded ? t("profile.statement.readLess") : t("profile.statement.readMore")}
        </button>
      )}
    </section>
  );
}
