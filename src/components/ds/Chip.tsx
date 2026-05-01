import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "warning" | "success" | "muted";
type Size = "xs" | "sm";

const TONES: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700",
  accent: "bg-zinc-900 text-white",
  warning: "bg-amber-100 text-amber-900",
  success: "bg-emerald-100 text-emerald-800",
  muted: "bg-zinc-50 text-zinc-500 border border-zinc-200",
};

// `xs` mirrors the inline pills used inside dense card metadata (role
// hints on FeedArtworkCard, secondary tags). `sm` is the default for
// list cards and hero badges.
const SIZES: Record<Size, string> = {
  xs: "px-1.5 py-0.5 text-[10px]",
  sm: "px-2 py-0.5 text-[11px]",
};

type Props = {
  children: ReactNode;
  tone?: Tone;
  size?: Size;
  href?: string;
  title?: string;
  className?: string;
};

/**
 * Minimal chip primitive used for role labels, status badges, and inline
 * filter pills. Keeps radius/typography consistent across surfaces.
 *
 * For toggle filters use `FilterChip`; for lane switches use `LaneChips`.
 */
export function Chip({
  children,
  tone = "neutral",
  size = "sm",
  href,
  title,
  className,
}: Props) {
  const cls = `inline-flex items-center rounded-full font-medium ${SIZES[size]} ${TONES[tone]} ${className ?? ""}`;
  if (href) {
    return (
      <Link href={href} title={title} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <span title={title} className={cls}>
      {children}
    </span>
  );
}
