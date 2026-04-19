"use client";

import { useT } from "@/lib/i18n/useT";

/**
 * Structural slot reserved for the upcoming AI/intelligence layer. Renders a
 * quiet, labelled container with no fake data and no "coming soon" promises
 * (see brief Track E). Exists so the layout already accounts for the surface
 * and future patches can drop content in without restyling the page.
 */
export function StudioIntelligenceSurface() {
  const { t } = useT();
  return (
    <section
      aria-labelledby="studio-intelligence-title"
      className="mb-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 p-4"
    >
      <p
        id="studio-intelligence-title"
        className="text-[11px] font-medium uppercase tracking-wide text-zinc-500"
      >
        {t("studio.intelligence.title")}
      </p>
      <div aria-hidden className="mt-2 h-14" />
    </section>
  );
}
