import type { ReactNode } from "react";

/**
 * A *quiet* section label — used inside a page surface where the
 * editorial kicker (uppercase tracking-[0.22em] + 2px accent) would
 * over-decorate. Render this for sub-section headers like "트렌딩",
 * "필터", or carousel rails inside a page that already owns the kicker.
 *
 * Visual weight is intentionally one notch below the kicker:
 *  - lighter tracking (`tracking-wide`)
 *  - softer color (`text-zinc-500`)
 *  - no accent line
 *
 * For strip-level headers that DO live as their own meaning unit (the
 * Living Salon strips), the editorial kicker is still the right tool.
 */

type Props = {
  children: ReactNode;
  as?: "p" | "h2" | "h3" | "span";
  className?: string;
  id?: string;
};

export function SectionLabel({
  children,
  as = "p",
  className,
  id,
}: Props) {
  const Tag = as;
  const cls = [
    "text-[11px] font-medium uppercase tracking-wide text-zinc-500",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag id={id} className={cls}>
      {children}
    </Tag>
  );
}
