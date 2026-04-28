"use client";

/**
 * BetaFeedbackPrompt — page-level "useful / confusing / issue" pill.
 *
 * Trigger policy:
 *   - Never on initial paint. Wait `delayMs` (default 25s) so we don't
 *     interrupt the first scan of the page.
 *   - At most ONE page-level prompt per session (enforced by `isFeedbackThrottled`).
 *   - Never re-show after dismissal in the same session.
 *   - Never overlap with the tour overlay (TourProvider mounts overlays
 *     at z-1200; this prompt sits inline, no overlap).
 *
 * Visual tone:
 *   - Soft pill, neutral palette, no exclamation marks.
 *   - Message field appears only after `confusing` / `blocked` / `issue`.
 *
 * Throttling notes:
 *   - We honor the global session cap so a user clicking through 5 pages
 *     only sees one feedback prompt.
 */

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/useT";
import {
  isFeedbackThrottled,
  markFeedbackDismissed,
  markFeedbackShown,
  submitBetaFeedback,
  type BetaFeedbackSentiment,
} from "@/lib/beta/feedback";

export type BetaFeedbackPromptProps = {
  pageKey: string;
  contextType?: string;
  contextId?: string;
  /** Delay before mounting (ms). Default: 25_000. */
  delayMs?: number;
  /** When true, mounts inline (no extra spacing wrappers). */
  compact?: boolean;
};

const SENTIMENT_OPTIONS: ReadonlyArray<{
  id: BetaFeedbackSentiment;
  labelKey: string;
  expandsMessage: boolean;
}> = [
  { id: "useful", labelKey: "feedback.sentiment.useful", expandsMessage: false },
  { id: "confusing", labelKey: "feedback.sentiment.confusing", expandsMessage: true },
  { id: "issue", labelKey: "feedback.sentiment.issue", expandsMessage: true },
];

export function BetaFeedbackPrompt({
  pageKey,
  contextType,
  contextId,
  delayMs = 25_000,
  compact,
}: BetaFeedbackPromptProps) {
  const { t } = useT();
  const [visible, setVisible] = useState(false);
  const [picked, setPicked] = useState<BetaFeedbackSentiment | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isFeedbackThrottled(pageKey)) return;
    const id = window.setTimeout(() => {
      if (isFeedbackThrottled(pageKey)) return;
      markFeedbackShown(pageKey);
      setVisible(true);
    }, Math.max(2000, delayMs));
    return () => window.clearTimeout(id);
  }, [pageKey, delayMs]);

  if (!visible) return null;

  if (done) {
    return (
      <div
        className={`${compact ? "" : "mt-6"} rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-600`}
        role="status"
      >
        {t("feedback.thanks")}
      </div>
    );
  }

  const expand = picked ? SENTIMENT_OPTIONS.find((o) => o.id === picked)?.expandsMessage : false;

  const onPick = (s: BetaFeedbackSentiment) => {
    if (submitting) return;
    setPicked(s);
    if (s === "useful") {
      void doSubmit(s, "");
    }
  };

  const doSubmit = async (s: BetaFeedbackSentiment, m: string) => {
    setSubmitting(true);
    const ok = await submitBetaFeedback({
      pageKey,
      sentiment: s,
      contextType,
      contextId,
      message: m.trim() || null,
    });
    setSubmitting(false);
    if (ok) setDone(true);
  };

  const onDismiss = () => {
    markFeedbackDismissed(pageKey);
    setVisible(false);
  };

  return (
    <div
      className={`${compact ? "" : "mt-6"} rounded-xl border border-zinc-200 bg-white p-4`}
      role="region"
      aria-label={t("feedback.promptAria")}
    >
      <p className="mb-2 text-sm font-medium text-zinc-900">
        {t("feedback.promptTitle")}
      </p>
      <p className="mb-3 text-xs text-zinc-500">{t("feedback.promptHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        {SENTIMENT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onPick(opt.id)}
            disabled={submitting}
            aria-pressed={picked === opt.id}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              picked === opt.id
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
            }`}
          >
            {t(opt.labelKey)}
          </button>
        ))}
        <button
          type="button"
          onClick={onDismiss}
          disabled={submitting}
          className="ml-auto rounded-md px-2 py-1 text-xs text-zinc-400 hover:text-zinc-700"
        >
          {t("feedback.dismiss")}
        </button>
      </div>
      {expand && picked ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("feedback.messagePlaceholder")}
            rows={3}
            maxLength={1000}
            className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setPicked(null);
                setMessage("");
              }}
              disabled={submitting}
              className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-zinc-800"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void doSubmit(picked, message)}
              disabled={submitting}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? t("feedback.sending") : t("feedback.send")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
