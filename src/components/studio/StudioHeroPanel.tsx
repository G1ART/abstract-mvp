"use client";

import type { ReactNode } from "react";

type Props = {
  hero: ReactNode;
  rail: ReactNode;
};

/**
 * Studio hero panel — Brief §3 Section 1.
 *
 * On desktop (≥lg) the hero (identity/primary actions) sits next to a
 * compact assistive rail on its right. On smaller viewports they stack
 * with the hero first, then the rail, matching the mobile priority
 * specified in the brief (hero → next steps → operation grid → …).
 */
export function StudioHeroPanel({ hero, rail }: Props) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
      <div data-tour="studio-hero">{hero}</div>
      <div>{rail}</div>
    </div>
  );
}
