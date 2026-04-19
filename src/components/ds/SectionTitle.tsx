import type { ReactNode } from "react";

type Props = {
  eyebrow?: string | null;
  children: ReactNode;
  action?: ReactNode;
  id?: string;
  size?: "sm" | "md";
};

/**
 * Section heading with optional uppercase eyebrow and trailing action slot.
 * Mirrors the rhythm documented in docs/DESIGN.md §3.
 */
export function SectionTitle({ eyebrow, children, action, id, size = "md" }: Props) {
  const titleClass =
    size === "sm"
      ? "text-sm font-semibold text-zinc-900"
      : "text-base font-semibold text-zinc-900";
  return (
    <header className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {eyebrow}
          </p>
        )}
        <h2 id={id} className={`truncate ${titleClass}`}>
          {children}
        </h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
