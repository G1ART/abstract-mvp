"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/useT";

export type NextAction = {
  key: string;
  label: string;
  href: string;
  priority: number;
};

type Props = {
  actions: NextAction[];
};

/**
 * Studio Next Actions (Track 3.2)
 *
 * Priority engine (computed upstream in the /my page) decides which of the
 * common actions to surface first. Each action is a chip → deep link.
 */
export function StudioNextActions({ actions }: Props) {
  const { t } = useT();
  if (actions.length === 0) return null;
  const ordered = [...actions].sort((a, b) => a.priority - b.priority).slice(0, 4);
  return (
    <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {t("studio.next.title")}
      </p>
      <div className="flex flex-wrap gap-2">
        {ordered.map((a) => (
          <Link
            key={a.key}
            href={a.href}
            className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-900 hover:text-zinc-900"
          >
            {a.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
