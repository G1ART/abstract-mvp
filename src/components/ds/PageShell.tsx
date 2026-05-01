import type { ReactNode } from "react";

/**
 * Single source of truth for *page-level* width, horizontal padding, and
 * vertical rhythm. Every primary surface should mount inside a `PageShell`
 * so the platform reads as one coherent salon — not a patchwork of
 * `max-w-2xl`, `max-w-[1200px]`, `max-w-3xl`, `max-w-5xl` invented per
 * page.
 *
 * Width vocabulary (deliberate, not exhaustive):
 *  - `feed`     — magazine grid (1200px); only Living Salon feed.
 *  - `default`  — most index/list surfaces (3xl).
 *  - `narrow`   — focused single-column forms (2xl).
 *  - `studio`   — operator dashboards with side-by-side panels (5xl).
 *  - `library`  — wide tabular surfaces (6xl).
 *
 * The shell intentionally renders a `<main>` element by default. Pages
 * can override with `as="div"` when the parent route already provides a
 * `<main>` (e.g. nested layouts). The optional `topAccessory` slot
 * mounts above the page header — used today by Upload / My / People /
 * Profile to anchor a `TourHelpButton` row without polluting the page
 * header itself.
 */

type Variant = "feed" | "default" | "narrow" | "studio" | "library";

type Props = {
  children: ReactNode;
  variant?: Variant;
  /**
   * Optional row rendered above the page header. Right-aligned, used for
   * tour help buttons and minor owner-only links.
   */
  topAccessory?: ReactNode;
  /**
   * Drop the default vertical padding — for pages whose first row needs
   * to bleed to the viewport edge (rare).
   */
  flushTop?: boolean;
  className?: string;
  /** Render with a custom element when `<main>` would nest. */
  as?: "main" | "div";
  id?: string;
};

const WIDTH: Record<Variant, string> = {
  feed: "max-w-[1200px]",
  default: "max-w-3xl",
  narrow: "max-w-2xl",
  studio: "max-w-5xl",
  library: "max-w-6xl",
};

const VERTICAL = "py-8 sm:py-10 lg:py-14";
const HORIZONTAL = "px-4 sm:px-6";

export function PageShell({
  children,
  variant = "default",
  topAccessory,
  flushTop,
  className,
  as = "main",
  id,
}: Props) {
  const Tag = as;
  const cls = [
    "mx-auto w-full",
    WIDTH[variant],
    HORIZONTAL,
    flushTop ? "" : VERTICAL,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag id={id} className={cls}>
      {topAccessory && (
        <div className="mb-2 flex items-center justify-end">{topAccessory}</div>
      )}
      {children}
    </Tag>
  );
}

/** Exported so secondary skeletons / inline shells can match the rhythm. */
export const PAGE_SHELL_TOKENS = {
  WIDTH,
  HORIZONTAL,
  VERTICAL,
} as const;

export type PageShellVariant = Variant;
