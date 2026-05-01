import Link from "next/link";
import type { ReactNode } from "react";

type Action = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type Props = {
  title: string;
  description?: string | null;
  action?: Action | null;
  secondaryAction?: Action | null;
  icon?: ReactNode;
  size?: "sm" | "md";
};

/**
 * Product-grade empty state. Kept intentionally quiet; a single sentence with
 * an implicit next action (docs/DESIGN.md §1.3).
 */
export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  icon,
  size = "md",
}: Props) {
  const pad = size === "sm" ? "px-4 py-6" : "px-4 py-10";
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 text-center ${pad}`}
    >
      {icon && <div aria-hidden className="text-zinc-400">{icon}</div>}
      <p className="text-sm text-zinc-700">{title}</p>
      {description && (
        <p className="max-w-md text-xs text-zinc-500">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action && <ActionButton action={action} tone="primary" />}
          {secondaryAction && (
            <ActionButton action={secondaryAction} tone="secondary" />
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  action,
  tone,
}: {
  action: Action;
  tone: "primary" | "secondary";
}) {
  const cls =
    tone === "primary"
      ? "inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800"
      : "inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50";
  if (action.href) {
    return (
      <Link href={action.href} className={cls}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={cls}>
      {action.label}
    </button>
  );
}
