"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/useT";

export type StudioSection = {
  key: "portfolio" | "exhibitions" | "inbox" | "messages" | "network" | "operations";
  labelKey: string;
  href: string;
  count?: number | null;
  badge?: string | null;
};

type Props = {
  sections: StudioSection[];
};

/**
 * Studio Section Nav (Track 3.1)
 *
 * Horizontal summary strip that deep-links into the existing /my/* sub
 * pages. Each card is a labelled count + secondary badge (e.g. unread).
 */
export function StudioSectionNav({ sections }: Props) {
  const { t } = useT();
  return (
    <nav className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {sections.map((s) => (
        <Link
          key={s.key}
          href={s.href}
          className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-3 transition-shadow hover:shadow-sm"
        >
          <p className="text-[11px] uppercase tracking-wide text-zinc-500 group-hover:text-zinc-900">
            {t(s.labelKey)}
          </p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">
            {s.count != null ? s.count : "—"}
          </p>
          {s.badge && (
            <p className="mt-0.5 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-white self-start">
              {s.badge}
            </p>
          )}
        </Link>
      ))}
    </nav>
  );
}
