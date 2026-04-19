"use client";

import { useT } from "@/lib/i18n/useT";
import { SectionFrame } from "@/components/ds/SectionFrame";
import type { AiDegradation } from "@/lib/ai/types";

type Props = {
  title?: string;
  hint?: string;
  loading?: boolean;
  degraded?: AiDegradation;
  drafts: string[];
  onApply?: (text: string) => void;
  onCopy?: (text: string) => void;
  applyLabelKey?: string;
  copyLabelKey?: string;
  emptyKey?: string;
};

/**
 * Shared preview panel for textual AI drafts. Renders each draft as an
 * editable-copy block with an "apply" and "copy" affordance. The caller
 * decides what apply does (insert into a textarea, replace field, etc.).
 */
export function AiDraftPanel({
  title,
  hint,
  loading,
  degraded,
  drafts,
  onApply,
  onCopy,
  applyLabelKey = "ai.action.apply",
  copyLabelKey = "ai.action.copy",
  emptyKey = "ai.state.empty",
}: Props) {
  const { t } = useT();

  const reason = degraded?.degraded ? degraded.reason : null;
  const errorKey = reason
    ? reason === "cap"
      ? "ai.error.softCap"
      : reason === "no_key"
        ? "ai.error.unavailable"
        : "ai.error.tryLater"
    : null;

  return (
    <SectionFrame tone="muted" padding="sm" noMargin>
      {title && (
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {title}
        </p>
      )}
      {hint && (
        <p className="mt-1 text-xs text-zinc-500">{hint}</p>
      )}
      {loading && (
        <p className="mt-3 text-xs text-zinc-500">{t("ai.state.loading")}</p>
      )}
      {!loading && errorKey && (
        <p className="mt-3 text-xs text-amber-700">{t(errorKey)}</p>
      )}
      {!loading && !errorKey && drafts.length === 0 && (
        <p className="mt-3 text-xs text-zinc-500">{t(emptyKey)}</p>
      )}
      {!loading && drafts.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {drafts.map((d, idx) => (
            <li
              key={idx}
              className="rounded-xl border border-zinc-200 bg-white p-3"
            >
              <p className="whitespace-pre-wrap text-sm text-zinc-800">{d}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {onApply && (
                  <button
                    type="button"
                    onClick={() => onApply(d)}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                  >
                    {t(applyLabelKey)}
                  </button>
                )}
                {onCopy && (
                  <button
                    type="button"
                    onClick={() => onCopy(d)}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500"
                  >
                    {t(copyLabelKey)}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionFrame>
  );
}

export function copyToClipboard(text: string): void {
  if (typeof window === "undefined") return;
  if (navigator?.clipboard?.writeText) {
    void navigator.clipboard.writeText(text);
    return;
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  } catch {
    /* ignore */
  }
}
