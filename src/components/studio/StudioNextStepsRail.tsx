"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import type { NextAction } from "./StudioNextActions";

type Props = {
  actions: NextAction[];
  /** Maximum items to surface in the rail. Brief caps this at 2–4. */
  max?: number;
};

/**
 * Compact assistive side-rail module surfacing the top prioritised
 * next-actions near the hero. This replaces the old full-width
 * `StudioNextActions` placement (which the Brief demotes to a small
 * supporting surface).
 */
export function StudioNextStepsRail({ actions, max = 4 }: Props) {
  const { t } = useT();
  const ordered = [...actions]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, Math.max(0, max));

  return (
    <aside
      data-tour="studio-next-steps"
      aria-label={t("studio.nextSteps.title")}
      className="flex h-full flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4"
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {t("studio.nextSteps.title")}
      </p>
      {ordered.length === 0 ? (
        <p className="text-xs text-zinc-500">{t("studio.nextSteps.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {ordered.map((a) => (
            <li key={a.key}>
              <Link
                href={a.href}
                className="group flex items-center justify-between gap-2 rounded-lg border border-transparent bg-white px-3 py-2 text-sm text-zinc-800 shadow-[inset_0_0_0_1px_rgb(228_228_231)] transition-colors hover:shadow-[inset_0_0_0_1px_rgb(161_161_170)]"
              >
                <span className="truncate">{a.label}</span>
                <span
                  aria-hidden
                  className="shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500"
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
