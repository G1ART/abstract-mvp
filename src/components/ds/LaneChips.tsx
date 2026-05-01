"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Single source of truth for "lane / segmented" pill groups — the kind
 * of toggle that sits below a page header and switches between
 * recommendation lanes ("Follow graph" / "Likes-based" / "Expand") or
 * portfolio sections ("Works" / "Exhibitions" / "Notes").
 *
 * Two visual densities, one shape language:
 *  - `lane`  — large pill, used for primary lane switches (People,
 *              public profile portfolio, upload tabs).
 *  - `sort`  — compact pill, used for secondary toggles inside a
 *              header strip (Feed sort).
 *
 * Both variants render `aria-pressed` on the active button (or
 * `aria-current="page"` on the active Link). Inactive buttons share
 * the same hairline `ring-1 ring-zinc-200` so neighbours sit on the
 * same baseline regardless of the chosen variant.
 *
 * For *toggle filters* (e.g. role chips that can stack), use
 * `FilterChip` instead — it owns the multi-select / clear-all dance.
 */

export type LaneOption<K extends string = string> = {
  id: K;
  label: ReactNode;
  /** Optional helper, rendered as `aria-label` for icon-only options. */
  ariaLabel?: string;
  /** When set, the option renders as a `<Link>` and `onChange` is ignored for it. */
  href?: string;
  /** Forwarded to the rendered DOM node, useful for product tours. */
  "data-tour"?: string;
};

type Variant = "lane" | "sort";

type Props<K extends string = string> = {
  options: ReadonlyArray<LaneOption<K>>;
  active: K;
  onChange?: (id: K) => void;
  variant?: Variant;
  /** ARIA group label, when the rail is not implicitly labelled. */
  ariaLabel?: string;
  className?: string;
  /** Forward `data-tour` to the rail wrapper for product tours. */
  "data-tour"?: string;
};

const SHARED_BTN = "rounded-full font-medium tracking-tight transition-colors";

const SIZE_CLS: Record<Variant, string> = {
  lane: "px-4 py-1.5 text-sm",
  sort: "px-3.5 py-1.5 text-xs",
};

const RAIL_CLS: Record<Variant, string> = {
  lane: "flex flex-wrap gap-2",
  sort: "inline-flex flex-wrap items-center gap-1.5",
};

export function LaneChips<K extends string = string>({
  options,
  active,
  onChange,
  variant = "lane",
  ariaLabel,
  className,
  ...rest
}: Props<K>) {
  const cls = [RAIL_CLS[variant], className ?? ""].filter(Boolean).join(" ");
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cls}
      data-tour={rest["data-tour"]}
    >
      {options.map((opt) => {
        const isActive = opt.id === active;
        const btnCls = [
          SHARED_BTN,
          SIZE_CLS[variant],
          isActive
            ? "bg-zinc-900 text-white"
            : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100",
        ].join(" ");
        if (opt.href) {
          return (
            <Link
              key={opt.id}
              href={opt.href}
              aria-current={isActive ? "page" : undefined}
              aria-label={opt.ariaLabel}
              data-tour={opt["data-tour"]}
              className={btnCls}
            >
              {opt.label}
            </Link>
          );
        }
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={isActive}
            aria-label={opt.ariaLabel}
            onClick={() => onChange?.(opt.id)}
            data-tour={opt["data-tour"]}
            className={btnCls}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
