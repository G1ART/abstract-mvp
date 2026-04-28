"use client";

/**
 * AiFeedbackChips — micro-feedback row that sits under an AI output.
 *
 * Three chips: useful / a-bit-off / needs-rework. Tapping any one
 * submits and locks the row into a calm acknowledgement. We do NOT show
 * a textarea here — page-level prompts cover that surface; chips stay a
 * one-tap interaction so users in flow are not interrupted.
 *
 * Designed to be drop-in beneath the result body of:
 *   - Board Pitch Pack
 *   - Exhibition Review
 *   - Delegation Brief
 *
 * Throttling: per-instance only (the user can leave a single signal per
 * AI result). No session-wide cap, since these are tied to specific
 * outputs and stay below the nag threshold.
 */

import { useState } from "react";
import { useT } from "@/lib/i18n/useT";
import { submitBetaFeedback, type BetaFeedbackSentiment } from "@/lib/beta/feedback";

export type AiFeedbackChipsProps = {
  /** Use the AI feature key, e.g. `ai.board_pitch_pack`. */
  pageKey: string;
  contextType?: string;
  contextId?: string;
  /** Optional `ai_event_id` so we can correlate with telemetry. */
  aiEventId?: string | null;
};

const OPTIONS: ReadonlyArray<{ id: BetaFeedbackSentiment; labelKey: string }> = [
  { id: "useful", labelKey: "feedback.ai.useful" },
  { id: "confusing", labelKey: "feedback.ai.slightlyOff" },
  { id: "issue", labelKey: "feedback.ai.needsRework" },
];

export function AiFeedbackChips({
  pageKey,
  contextType,
  contextId,
  aiEventId,
}: AiFeedbackChipsProps) {
  const { t } = useT();
  const [picked, setPicked] = useState<BetaFeedbackSentiment | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const onPick = async (id: BetaFeedbackSentiment) => {
    if (picked || submitted) return;
    setPicked(id);
    const ok = await submitBetaFeedback({
      pageKey,
      sentiment: id,
      contextType: contextType ?? null,
      contextId: contextId ?? null,
      metadata: aiEventId ? { ai_event_id: aiEventId } : {},
    });
    if (ok) setSubmitted(true);
  };

  if (submitted) {
    return (
      <p className="mt-2 text-[11px] text-zinc-400" role="status">
        {t("feedback.ai.thanks")}
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-zinc-400">{t("feedback.ai.prompt")}</span>
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => void onPick(opt.id)}
          aria-pressed={picked === opt.id}
          disabled={Boolean(picked)}
          className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
            picked === opt.id
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-200 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
          }`}
        >
          {t(opt.labelKey)}
        </button>
      ))}
    </div>
  );
}
