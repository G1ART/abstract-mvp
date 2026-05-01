import type { ReactNode } from "react";

/**
 * "Floor-tinted" container — `bg-zinc-50/70` over `rounded-2xl`. Used
 * to mark a different unit on the page (a recommendation rail, an
 * empty-state explainer, a trending shelf) without shouting.
 *
 * Single opacity (`/70`) on purpose. Earlier surfaces were sprinkled
 * with `/50`, `/60`, and `/70` — a tax on the eye that this primitive
 * removes by being the canonical home for "soft panel".
 */

type Padding = "sm" | "md" | "lg";

type Props = {
  children: ReactNode;
  padding?: Padding;
  className?: string;
  id?: string;
  "aria-labelledby"?: string;
  as?: "section" | "div" | "aside";
};

const PADDING_CLS: Record<Padding, string> = {
  sm: "px-5 py-5 lg:px-6 lg:py-6",
  md: "px-6 py-7 lg:px-7 lg:py-8",
  lg: "px-6 py-9 lg:px-8",
};

export function FloorPanel({
  children,
  padding = "md",
  className,
  id,
  as = "section",
  ...rest
}: Props) {
  const Tag = as;
  const cls = [
    "rounded-2xl bg-zinc-50/70",
    PADDING_CLS[padding],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag id={id} aria-labelledby={rest["aria-labelledby"]} className={cls}>
      {children}
    </Tag>
  );
}
