import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  tone?: "default" | "muted" | "dashed";
  /** Remove the default `mb-6` so callers can opt out of the vertical rhythm. */
  noMargin?: boolean;
  id?: string;
  "aria-labelledby"?: string;
};

const PADDINGS: Record<NonNullable<Props["padding"]>, string> = {
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

const TONES: Record<NonNullable<Props["tone"]>, string> = {
  default: "border-zinc-200 bg-white",
  muted: "border-zinc-200 bg-zinc-50/60",
  dashed: "border-dashed border-zinc-300 bg-zinc-50/60",
};

/**
 * Shared section shell used by Studio and other orchestrator pages so that
 * corner radius, border, and padding rhythm stay consistent (see docs/DESIGN.md §5).
 */
export function SectionFrame({
  children,
  className,
  padding = "md",
  tone = "default",
  noMargin,
  id,
  ...rest
}: Props) {
  const cls = [
    "rounded-2xl border",
    TONES[tone],
    PADDINGS[padding],
    noMargin ? "" : "mb-6",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section id={id} aria-labelledby={rest["aria-labelledby"]} className={cls}>
      {children}
    </section>
  );
}
