"use client";

import type { ReactNode } from "react";

/**
 * Toggle filter chip — a stackable, multi-select alternative to
 * `LaneChips`. Used for role filters, theme filters, status filters.
 *
 * Visual contract:
 *  - `rounded-full px-3 py-1 text-sm`
 *  - active = `bg-zinc-900 text-white`
 *  - inactive = `bg-white text-zinc-700 ring-1 ring-zinc-200`
 *  - `aria-pressed` reflects the current state
 *
 * Pair with a "clear all" button (caller-side) when multiple chips can
 * be active at once; this primitive deliberately stays single-toggle.
 */

type Props = {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  type?: "button" | "submit";
  /** Optional title attribute for tooltip. */
  title?: string;
  disabled?: boolean;
};

export function FilterChip({
  active,
  onClick,
  children,
  className,
  type = "button",
  title,
  disabled,
}: Props) {
  const cls = [
    "inline-flex items-center rounded-full px-3 py-1 text-sm transition-colors",
    active
      ? "bg-zinc-900 text-white"
      : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100",
    disabled ? "cursor-not-allowed opacity-50" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type={type}
      onClick={onClick}
      aria-pressed={active}
      title={title}
      disabled={disabled}
      className={cls}
    >
      {children}
    </button>
  );
}
