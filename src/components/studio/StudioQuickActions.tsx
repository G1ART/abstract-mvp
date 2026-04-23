"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/useT";

export type QuickActionTone = "primary" | "secondary" | "tertiary";

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
 * Studio Quick Actions — a strict 3-tier hierarchy surface:
 *   • primary   — one filled CTA (e.g. Upload artwork)
 *   • secondary — 2-3 outlined high-frequency destinations
 *   • tertiary  — hidden behind a "더 보기" disclosure panel
 *
 * This is deliberately NOT a chip wall. If a page wants to surface more
 * than ~4 same-weight actions, that's a signal to demote some into the
 * tertiary tier.
 */
export function StudioQuickActions({ actions }: Props) {
  const { t } = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (e.target instanceof Node && panelRef.current.contains(e.target)) return;
      setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  if (actions.length === 0) return null;

  const primary = actions.filter((a) => a.tone === "primary");
  const secondary = actions.filter((a) => a.tone === "secondary" || a.tone === undefined);
  const tertiary = actions.filter((a) => a.tone === "tertiary");

  return (
    <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {t("studio.quickActions.title")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {primary.map((a) => (
          <Link
            key={a.key}
            href={a.href}
            className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            {a.label}
          </Link>
        ))}
        {secondary.map((a) => (
          <Link
            key={a.key}
            href={a.href}
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-500 hover:text-zinc-900"
          >
            {a.label}
          </Link>
        ))}
        {tertiary.length > 0 && (
          <div className="relative" ref={panelRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              aria-label={t("studio.quickActions.moreAriaLabel")}
              className="inline-flex items-center gap-1 rounded-lg border border-transparent bg-transparent px-2 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            >
              {t("studio.quickActions.more")}
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                className={`transition-transform ${moreOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              >
                <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {moreOpen && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
              >
                {tertiary.map((a) => (
                  <Link
                    key={a.key}
                    href={a.href}
                    role="menuitem"
                    onClick={() => setMoreOpen(false)}
                    className="block px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    {a.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
