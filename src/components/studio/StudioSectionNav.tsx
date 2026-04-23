"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/useT";

export type StudioSection = {
  key:
    | "portfolio"
    | "exhibitions"
    | "inbox"
    | "messages"
    | "network"
    | "operations"
    | "workshop"
    | "boards";
  labelKey: string;
  /** Optional one-line helper text key. Surfaces the purpose of the destination. */
  descKey?: string;
  href: string;
  count?: number | null;
  badge?: string | null;
};

type Props = {
  sections: StudioSection[];
};

/**
 * Studio Section Nav (Brief 1 + 2, 2026-04-22)
 *
 * Explanatory management grid that deep-links into `/my/*` sub pages.
 * Each card shows: label + one-line descriptor + count + optional urgent
 * badge. The point is "you know exactly what's behind every tile before
 * you click." Labels alone can't do that, so `descKey` is first-class.
 */
export function StudioSectionNav({ sections }: Props) {
  const { t } = useT();
  return (
    <nav className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {sections.map((s) => (
        <Link
          key={s.key}
          href={s.href}
          className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-4 transition-all hover:border-zinc-400 hover:shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-900 group-hover:text-zinc-700">
              {t(s.labelKey)}
            </p>
            {s.count != null && (
              <p className="shrink-0 text-sm tabular-nums text-zinc-500">
                {s.count}
              </p>
            )}
          </div>
          {s.descKey && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">
              {t(s.descKey)}
            </p>
          )}
          {s.badge && (
            <p className="mt-2 self-start rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white">
              {s.badge}
            </p>
          )}
        </Link>
      ))}
    </nav>
  );
}
