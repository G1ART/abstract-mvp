"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/useT";

/**
 * Static "Theo News" placeholder rail (wireframe redesign). The list UI is in
 * place but data is not wired yet — a later patch will back it with real
 * announcements. Kept intentionally content-agnostic so swapping in real data
 * only touches the item source, not the layout.
 */
const PLACEHOLDER_NEWS = Array.from({ length: 6 }, (_, i) => ({ id: i }));

export function RightRail() {
  const { t } = useT();
  const router = useRouter();
  const [q, setQ] = useState("");

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `/people?q=${encodeURIComponent(query)}` : "/people");
  }

  return (
    <div className="flex flex-col gap-8 py-8 pl-2">
      <form onSubmit={submitSearch} className="relative">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("shell.searchPlaceholder")}
          aria-label={t("shell.searchPlaceholder")}
          className="w-full rounded-full border border-zinc-300 bg-white py-2 pl-4 pr-10 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          aria-label={t("shell.searchSubmit")}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-zinc-500 hover:text-zinc-900"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </form>

      <section aria-label={t("shell.newsTitle")}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">{t("shell.newsTitle")}</h2>
          <div className="flex items-center gap-1 text-zinc-300" aria-hidden>
            <span className="p-1">‹</span>
            <span className="p-1">›</span>
          </div>
        </div>
        <ul className="rounded-lg border border-zinc-200 bg-white">
          {PLACEHOLDER_NEWS.map((n, idx) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 p-3 ${idx > 0 ? "border-t border-zinc-100" : ""}`}
            >
              <span className="mt-0.5 shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                {t("shell.newsType")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm text-zinc-400">{t("shell.newsItemTitle")}</p>
                  <span className="shrink-0 text-[11px] text-zinc-300">{t("shell.newsItemTime")}</span>
                </div>
                <p className="truncate text-xs text-zinc-300">{t("shell.newsItemDesc")}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
