"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/useT";
import type { MessageKey } from "@/lib/i18n/messages";
import { aiApi } from "@/lib/ai/browser";
import {
  AiSurfaceFrame,
  AiStateBlock,
  AiResultSection,
  AiCopyButton,
  AiStatusChip,
  AiDisclosureNote,
} from "@/components/ai/primitives";
import { AiFeedbackChips } from "@/components/beta";
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

const SEVERITY_TONE: Record<ExhibitionReviewSeverity, "neutral" | "suggest" | "warn"> = {
  info: "neutral",
  suggest: "suggest",
  warn: "warn",
};

/**
 * P1-B — Exhibition Review panel.
 *
 * Calm collapsed CTA. Renders a readiness percentage, an editorial
 * checklist of issues (info/suggest/warn), and 1–3 alternative copy
 * blocks the curator can copy out. Drafts are *never* auto-applied —
 * the curator owns the final wall text / description.
 *
 * UX system alignment: shares `AiSurfaceFrame`/`AiStateBlock`/`AiCopyButton`
 * with Board Pitch Pack and Delegation Brief so all three panels feel
 * like one product.
 */
export function ExhibitionReviewPanel({ exhibitionId }: Props) {
  const { t, locale } = useT();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExhibitionReviewResult | null>(null);

  const trigger = async () => {
    setLoading(true);
    const res = await aiApi.exhibitionReview({ exhibitionId, locale });
    setResult(res);
    setLoading(false);
  };

  const aiEventId = result?.aiEventId ?? null;
  const issues = (result?.issues ?? []).filter(
    (i) => i && typeof i.message === "string" && i.message.trim().length > 0,
  );
  const drafts = (result?.drafts ?? []).filter(
    (d) => d && typeof d.body === "string" && d.body.trim().length > 0,
  );
  const readiness =
    typeof result?.readiness === "number"
      ? Math.max(0, Math.min(100, Math.round(result.readiness)))
      : null;

  return (
    <AiSurfaceFrame
      title={t("exhibition.review.title")}
      subtitle={t("exhibition.review.hint")}
      className="mb-4"
    >
      {() => (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={trigger}
              disabled={loading}
              className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading
                ? t("ai.common.loading")
                : issues.length > 0
                  ? t("ai.common.regenerate")
                  : t("exhibition.review.cta")}
            </button>
            <AiDisclosureNote />
          </div>

          <AiStateBlock loading={loading} result={result} />

          {readiness !== null && (
            <div className="rounded border border-zinc-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  {t("exhibition.review.readinessLabel")}
                </span>
                <span className="text-sm font-semibold text-zinc-800">
                  {readiness}%
                </span>
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
            <AiResultSection title={t("exhibition.review.issuesLabel")}>
              <ul className="space-y-2">
                {issues.slice(0, 8).map((iss) => {
                  const sev: ExhibitionReviewSeverity =
                    iss.severity in SEVERITY_LABEL
                      ? (iss.severity as ExhibitionReviewSeverity)
                      : "info";
                  return (
                    <li
                      key={`iss-${iss.id}`}
                      className="rounded border border-zinc-200 bg-white p-3 text-sm leading-relaxed text-zinc-800"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <AiStatusChip
                          label={t(SEVERITY_LABEL[sev])}
                          tone={SEVERITY_TONE[sev]}
                        />
                      </div>
                      <p>{iss.message}</p>
                      {iss.suggestion && (
                        <div className="mt-2 flex items-start justify-between gap-2 rounded bg-zinc-50 p-2 text-[13px] text-zinc-700">
                          <span className="flex-1 whitespace-pre-line">
                            {iss.suggestion}
                          </span>
                          <AiCopyButton
                            text={iss.suggestion ?? ""}
                            feature="exhibition_review"
                            aiEventId={aiEventId}
                            meta={{ kind: "issue_suggestion", code: iss.code }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </AiResultSection>
          )}

          {drafts.length > 0 && (
            <AiResultSection title={t("exhibition.review.draftsLabel")}>
              <ul className="space-y-2">
                {drafts.slice(0, 3).map((draft, idx) => (
                  <li
                    key={`draft-${idx}`}
                    className="rounded border border-zinc-200 bg-white p-3 text-sm leading-relaxed text-zinc-800"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <AiStatusChip label={draft.kind} tone="draft" />
                      <AiCopyButton
                        text={draft.body}
                        feature="exhibition_review"
                        aiEventId={aiEventId}
                        meta={{ kind: draft.kind }}
                      />
                    </div>
                    <p className="whitespace-pre-line">{draft.body}</p>
                  </li>
                ))}
              </ul>
            </AiResultSection>
          )}

          {result && (
            <AiFeedbackChips
              pageKey="ai.exhibition_review"
              contextType="exhibition"
              contextId={exhibitionId}
              aiEventId={aiEventId}
            />
          )}
        </>
      )}
    </AiSurfaceFrame>
  );
}
