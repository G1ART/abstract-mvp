"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/useT";
import type { MessageKey } from "@/lib/i18n/messages";
import { aiApi } from "@/lib/ai/browser";
import { markAiAccepted } from "@/lib/ai/accept";
import { aiErrorKey } from "@/components/studio/intelligence/aiCardState";
import { copyToClipboard } from "@/components/ai/AiDraftPanel";
import type {
  ExhibitionReviewResult,
  ExhibitionReviewSeverity,
} from "@/lib/ai/types";

type Props = {
  exhibitionId: string;
};

const SEVERITY_LABEL: Record<ExhibitionReviewSeverity, MessageKey> = {
  info: "exhibition.review.severity.info",
  suggest: "exhibition.review.severity.suggest",
  warn: "exhibition.review.severity.warn",
};

const SEVERITY_BADGE: Record<ExhibitionReviewSeverity, string> = {
  info: "bg-zinc-100 text-zinc-700",
  suggest: "bg-blue-50 text-blue-700",
  warn: "bg-amber-50 text-amber-700",
};

/**
 * P1-B — Exhibition Review panel.
 *
 * Calm collapsed CTA. Renders a readiness percentage, an editorial
 * checklist of issues (info/suggest/warn), and 1–3 alternative copy
 * blocks the curator can copy out. Drafts are *never* auto-applied —
 * the curator owns the final wall text / description.
 */
export function ExhibitionReviewPanel({ exhibitionId }: Props) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExhibitionReviewResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const trigger = async () => {
    setLoading(true);
    setCopiedKey(null);
    const res = await aiApi.exhibitionReview({ exhibitionId, locale });
    setResult(res);
    setLoading(false);
  };

  const errorKey = aiErrorKey(result);
  const aiEventId = result?.aiEventId ?? null;
  const issues = (result?.issues ?? []).filter(
    (i) => i && typeof i.message === "string" && i.message.trim().length > 0,
  );
  const drafts = (result?.drafts ?? []).filter(
    (d) => d && typeof d.body === "string" && d.body.trim().length > 0,
  );
  const readiness = typeof result?.readiness === "number" ? Math.max(0, Math.min(100, Math.round(result.readiness))) : null;

  const onCopy = (key: string, text: string) => {
    copyToClipboard(text);
    setCopiedKey(key);
    void markAiAccepted(aiEventId, { feature: "exhibition_review", via: "copy" });
    setTimeout(() => setCopiedKey((v) => (v === key ? null : v)), 1500);
  };

  return (
    <section className="mb-4 rounded-xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50/60 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900">
            {t("exhibition.review.title")}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {t("exhibition.review.hint")}
          </p>
        </div>
        <span className="shrink-0 text-xs text-zinc-500">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={trigger}
              disabled={loading}
              className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading
                ? t("exhibition.review.loading")
                : issues.length > 0
                  ? t("exhibition.review.regenerate")
                  : t("exhibition.review.cta")}
            </button>
            <span className="text-[11px] text-zinc-500">
              {t("exhibition.review.disclaimer")}
            </span>
          </div>

          {errorKey && (
            <p className="text-xs text-amber-700" role="alert">
              {t(errorKey)}
            </p>
          )}

          {readiness !== null && (
            <div className="rounded border border-zinc-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  {t("exhibition.review.readinessLabel")}
                </span>
                <span className="text-sm font-semibold text-zinc-800">{readiness}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full bg-zinc-900"
                  style={{ width: `${readiness}%` }}
                />
              </div>
            </div>
          )}

          {issues.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("exhibition.review.issuesLabel")}
              </p>
              <ul className="space-y-2">
                {issues.slice(0, 8).map((iss) => {
                  const key = `iss-${iss.id}`;
                  const sev: ExhibitionReviewSeverity = (
                    iss.severity in SEVERITY_LABEL ? iss.severity : "info"
                  ) as ExhibitionReviewSeverity;
                  return (
                    <li
                      key={key}
                      className="rounded border border-zinc-200 bg-white p-3 text-sm leading-relaxed text-zinc-800"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${SEVERITY_BADGE[sev]}`}>
                          {t(SEVERITY_LABEL[sev])}
                        </span>
                        <span className="text-[11px] text-zinc-500">{iss.code}</span>
                      </div>
                      <p>{iss.message}</p>
                      {iss.suggestion && (
                        <div className="mt-2 flex items-start justify-between gap-2 rounded bg-zinc-50 p-2 text-[13px] text-zinc-700">
                          <span className="flex-1 whitespace-pre-line">{iss.suggestion}</span>
                          <button
                            type="button"
                            onClick={() => onCopy(`${key}-sug`, iss.suggestion ?? "")}
                            className="shrink-0 rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-100"
                          >
                            {copiedKey === `${key}-sug`
                              ? t("exhibition.review.copied")
                              : t("exhibition.review.copy")}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {drafts.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("exhibition.review.draftsLabel")}
              </p>
              <ul className="space-y-2">
                {drafts.slice(0, 3).map((draft, idx) => {
                  const key = `draft-${idx}`;
                  return (
                    <li
                      key={key}
                      className="rounded border border-zinc-200 bg-white p-3 text-sm leading-relaxed text-zinc-800"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-600">
                          {draft.kind}
                        </span>
                        <button
                          type="button"
                          onClick={() => onCopy(key, draft.body)}
                          className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-100"
                        >
                          {copiedKey === key
                            ? t("exhibition.review.copied")
                            : t("exhibition.review.copy")}
                        </button>
                      </div>
                      <p className="whitespace-pre-line">{draft.body}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
