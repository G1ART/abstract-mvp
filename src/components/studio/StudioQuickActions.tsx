"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/useT";

export type QuickActionTone = "primary" | "secondary";

export type QuickAction = {
  key: string;
  label: string;
  href: string;
  tone?: QuickActionTone;
};

type Props = {
  actions: QuickAction[];
};

/**
 * Studio Quick Actions — compact create/navigate row that complements
 * `StudioNextActions` (priority-driven) with the stable "create" affordances
 * (Upload, Exhibition, Library, etc.) the user always needs. Kept intentionally
 * small so it does not re-create the old CTA wall removed from `/my`.
 */
export function StudioQuickActions({ actions }: Props) {
  const { t } = useT();
  if (actions.length === 0) return null;
  return (
    <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {t("studio.quickActions.title")}
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          const cls =
            a.tone === "primary"
              ? "rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
              : "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500 hover:text-zinc-900";
          return (
            <Link key={a.key} href={a.href} className={cls}>
              {a.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
