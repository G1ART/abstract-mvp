"use client";

import { useT } from "@/lib/i18n/useT";

type Tab = "all" | "following";
type Sort = "latest" | "popular";

type Props = {
  tab: Tab;
  sort: Sort;
  isLoading: boolean;
  onTabChange: (tab: Tab) => void;
  onSortChange: (sort: Sort) => void;
  onRefresh: () => void;
};

/**
 * Living Salon header. Pairs a quiet brand line with two control rows:
 *
 *   Primary  [Recommended] [Following]            ← `tab` toggle
 *   Sort     [New works]   [Resonating]   [↻]    ← `sort` + manual refresh
 *
 * The two control rows live in one strip on desktop (kept compact) and stack
 * on mobile so the secondary sort never crowds the primary lane. All copy is
 * i18n-routed; no English literals leak through.
 */
export function FeedHeader({
  tab,
  sort,
  isLoading,
  onTabChange,
  onSortChange,
  onRefresh,
}: Props) {
  const { t } = useT();

  return (
    <header className="mb-8 border-b border-zinc-100 pb-5">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          {t("feed.todayTitle")}
        </h1>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-zinc-500">
          {t("feed.todaySubtitle")}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav
          aria-label={t("feed.todayTitle")}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-1"
        >
          <PillButton
            active={tab === "all"}
            onClick={() => onTabChange("all")}
          >
            {t("feed.tabRecommended")}
          </PillButton>
          <PillButton
            active={tab === "following"}
            onClick={() => onTabChange("following")}
          >
            {t("feed.tabFollowing")}
          </PillButton>
        </nav>

        <div className="flex items-center gap-3 text-sm">
          <div className="inline-flex items-center gap-3 text-zinc-500">
            <SortButton
              active={sort === "latest"}
              onClick={() => onSortChange("latest")}
            >
              {t("feed.sortNewWorks")}
            </SortButton>
            <span aria-hidden className="text-zinc-300">
              ·
            </span>
            <SortButton
              active={sort === "popular"}
              onClick={() => onSortChange("popular")}
            >
              {t("feed.sortResonating")}
            </SortButton>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label={t("feed.refreshQuiet")}
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1.5 text-xs font-medium tracking-tight text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[6.5rem] sm:px-3"
          >
            <RefreshGlyph spinning={isLoading} />
            <span className="hidden sm:inline">
              {isLoading ? t("feed.refreshing") : t("feed.refreshQuiet")}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium tracking-tight transition-colors ${
        active
          ? "bg-zinc-900 text-white"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      }`}
    >
      {children}
    </button>
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-sm tracking-tight transition-colors ${
        active
          ? "font-medium text-zinc-900"
          : "font-normal text-zinc-500 hover:text-zinc-700"
      }`}
    >
      {children}
    </button>
  );
}

function RefreshGlyph({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={spinning ? "animate-spin" : ""}
    >
      <path
        d="M2.5 8a5.5 5.5 0 0 1 9.4-3.9M13.5 8a5.5 5.5 0 0 1-9.4 3.9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M11.5 1.5v3h-3M4.5 14.5v-3h3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
