"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/useT";
import { SectionFrame } from "@/components/ds/SectionFrame";
import { ConfirmActionDialog } from "@/components/ds/ConfirmActionDialog";
import type { AiDegradation } from "@/lib/ai/types";

/**
 * How adopting a single draft text should behave relative to the host
 * field the draft will end up in.
 *
 * - `insert`: field is empty (or append-to-empty); one-click apply.
 * - `append`: field has content; draft is concatenated with a separator.
 * - `replace`: field has content; we ask for explicit confirmation before
 *   overwriting.
 *
 * When the caller isn't a text field (e.g. Studio suggestion link,
 * copy-only intro draft) use `mode: "link"` and provide only `onCopy`.
 */
export type ApplyMode = "insert" | "append" | "replace" | "link";

type Props = {
  title?: string;
  hint?: string;
  loading?: boolean;
  degraded?: AiDegradation;
  drafts: string[];
  /**
   * Runs when the user adopts a single draft as their new value. The panel
   * handles the Replace confirmation internally before invoking it. The
   * callback receives the composed text (already merged for `append`).
   */
  onApply?: (text: string, mode: Exclude<ApplyMode, "link">) => void;
  onCopy?: (text: string) => void;
  onDismiss?: () => void;
  /**
   * Current value of the text field the draft would land in. Used to pick
   * between Insert / Replace / Append when applyMode is `auto`.
   */
  currentValue?: string;
  /** Default: `auto`, which picks `insert` when the field is empty else `replace`. */
  applyMode?: ApplyMode | "auto";
  /** Optional custom label override for the primary apply button. */
  applyLabelKey?: string;
  copyLabelKey?: string;
  emptyKey?: string;
  /**
   * Optional badge labels rendered above each draft (1-to-1 with `drafts`).
   * Used by surfaces like Inquiry Reply to show the "Short / Long" variant.
   */
  draftLabels?: Array<string | null>;
};

const MODE_LABEL: Record<Exclude<ApplyMode, "link">, string> = {
  insert: "ai.action.insert",
  append: "ai.action.append",
  replace: "ai.action.replace",
};

function resolveMode(
  preferred: ApplyMode | "auto" | undefined,
  currentValue: string | undefined,
): Exclude<ApplyMode, "link"> | "link" {
  if (preferred === "link") return "link";
  if (preferred && preferred !== "auto") return preferred;
  return (currentValue ?? "").trim().length === 0 ? "insert" : "replace";
}

export function AiDraftPanel({
  title,
  hint,
  loading,
  degraded,
  drafts,
  onApply,
  onCopy,
  onDismiss,
  currentValue,
  applyMode,
  applyLabelKey,
  copyLabelKey = "ai.action.copy",
  emptyKey = "ai.state.empty",
  draftLabels,
}: Props) {
  const { t } = useT();

  const reason = degraded?.degraded ? degraded.reason : null;
  const errorKey = reason
    ? reason === "cap"
      ? "ai.error.softCap"
      : reason === "no_key"
        ? "ai.error.unavailable"
        : reason === "invalid_input"
          ? "ai.error.invalidInput"
          : "ai.error.tryLater"
    : null;

  const mode = resolveMode(applyMode, currentValue);
  const [pendingReplace, setPendingReplace] = useState<string | null>(null);

  const handleApply = (draft: string) => {
    if (!onApply || mode === "link") return;
    if (mode === "replace") {
      setPendingReplace(draft);
      return;
    }
    if (mode === "append") {
      const base = (currentValue ?? "").trimEnd();
      const next = base.length ? `${base}\n\n${draft}` : draft;
      onApply(next, "append");
      return;
    }
    onApply(draft, "insert");
  };

  const confirmReplace = () => {
    if (pendingReplace == null || !onApply) return;
    onApply(pendingReplace, "replace");
    setPendingReplace(null);
  };

  const cancelReplace = () => setPendingReplace(null);

  const primaryLabel = applyLabelKey
    ? t(applyLabelKey)
    : mode === "link"
      ? t("ai.action.apply")
      : t(MODE_LABEL[mode]);

  return (
    <SectionFrame tone="muted" padding="sm" noMargin>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {title && (
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {title}
            </p>
          )}
          {hint && (
            <p className="mt-1 text-xs text-zinc-500">{hint}</p>
          )}
        </div>
        {onDismiss && !loading && (drafts.length > 0 || errorKey) && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-600 hover:border-zinc-400"
          >
            {t("ai.action.dismiss")}
          </button>
        )}
      </div>
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
              {draftLabels?.[idx] && (
                <span className="mb-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                  {draftLabels[idx]}
                </span>
              )}
              <p className="whitespace-pre-wrap text-sm text-zinc-800">{d}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {onApply && mode !== "link" && (
                  <button
                    type="button"
                    onClick={() => handleApply(d)}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                  >
                    {primaryLabel}
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
      <ConfirmActionDialog
        open={pendingReplace !== null}
        title={t("ai.action.confirmReplace")}
        description={t("ai.action.confirmReplaceHint")}
        confirmLabel={t("ai.action.replace")}
        cancelLabel={t("ai.action.cancel")}
        tone="destructive"
        onConfirm={confirmReplace}
        onCancel={cancelReplace}
      />
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
