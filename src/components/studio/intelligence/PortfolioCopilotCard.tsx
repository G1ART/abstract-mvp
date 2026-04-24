"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SectionFrame } from "@/components/ds/SectionFrame";
import { SectionTitle } from "@/components/ds/SectionTitle";
import { Chip } from "@/components/ds/Chip";
import { useT } from "@/lib/i18n/useT";
import { aiApi } from "@/lib/ai/browser";
import { markAiAccepted } from "@/lib/ai/accept";
import { aiErrorKey } from "./aiCardState";
import { copyToClipboard } from "@/components/ai/AiDraftPanel";
import {
  resolvePortfolioActionLabel,
  stripOpaqueIdsFromCopilotText,
} from "@/lib/ai/portfolioCopilotDisplay";
import type { MessageKey } from "@/lib/i18n/messages";
import type {
  PortfolioMetadataGaps,
  PortfolioSuggestion,
  PortfolioSuggestionsResult,
} from "@/lib/ai/types";

type Props = {
  portfolioInput: Record<string, unknown>;
  artworkCount: number;
  /**
   * id → title lookup used to render readable deep-link chips for
   * `artworkIds` on each suggestion. When the title is missing the card
   * falls back to the raw id so the link still works.
   */
  artworkTitles?: Record<string, string>;
};

const KIND_LABEL: Record<PortfolioSuggestion["kind"], MessageKey> = {
  reorder: "ai.portfolio.kind.reorder",
  series: "ai.portfolio.kind.series",
  metadata: "ai.portfolio.kind.metadata",
  exhibition_link: "ai.portfolio.kind.exhibition_link",
  feature: "ai.portfolio.kind.feature",
};

const KIND_ORDER: Array<PortfolioSuggestion["kind"]> = [
  "feature",
  "reorder",
  "series",
  "metadata",
  "exhibition_link",
];

export function PortfolioCopilotCard({
  portfolioInput,
  artworkCount,
  artworkTitles,
}: Props) {
  const { t } = useT();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PortfolioSuggestionsResult | null>(null);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});

  const disabled = artworkCount < 2;

  const trigger = async () => {
    setLoading(true);
    setReviewed({});
    const res = await aiApi.portfolioCopilot({ portfolio: portfolioInput });
    setResult(res);
    setLoading(false);
  };

  const errorKey = aiErrorKey(result);
  const aiEventId = result?.aiEventId ?? null;

  const metadataGaps = (() => {
    const raw = (portfolioInput as { metadataGaps?: PortfolioMetadataGaps }).metadataGaps;
    return raw && typeof raw === "object" ? raw : null;
  })();

  const grouped = useMemo(() => {
    const map = new Map<PortfolioSuggestion["kind"], PortfolioSuggestion[]>();
    for (const s of result?.suggestions ?? []) {
      const arr = map.get(s.kind) ?? [];
      arr.push(s);
      map.set(s.kind, arr);
    }
    return KIND_ORDER.filter((k) => map.has(k)).map(
      (k) => [k, map.get(k) as PortfolioSuggestion[]] as const,
    );
  }, [result]);

  const titleForChip = (id: string, slotIndex: number) => {
    const title = artworkTitles?.[id]?.trim();
    if (title) return title;
    return t("ai.portfolio.unnamedSlot").replace("{n}", String(slotIndex + 1));
  };

  return (
    <SectionFrame padding="md" noMargin>
      <SectionTitle
        eyebrow={t("ai.portfolio.card.title")}
        action={
          <div className="flex items-center gap-2">
            {result && (
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setReviewed({});
                }}
                className="rounded-lg border border-transparent px-2 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800"
              >
                {t("ai.action.dismiss")}
              </button>
            )}
            <button
              type="button"
              onClick={trigger}
              disabled={loading || disabled}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500 disabled:opacity-60"
              title={t("ai.disclosure.tooltip")}
            >
              {loading ? t("ai.state.loading") : t("ai.portfolio.cta")}
            </button>
          </div>
        }
      >
        {t("ai.portfolio.card.subtitle")}
      </SectionTitle>

      {metadataGaps && artworkCount > 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-zinc-600">
          {t("ai.portfolio.gapSummary")
            .replace("{missing_title}", String(metadataGaps.missing_title))
            .replace("{missing_year}", String(metadataGaps.missing_year))
            .replace("{missing_medium}", String(metadataGaps.missing_medium))
            .replace("{missing_size}", String(metadataGaps.missing_size))
            .replace("{no_image}", String(metadataGaps.no_image))
            .replace("{drafts}", String(metadataGaps.drafts_not_public))}
        </p>
      ) : null}

      {disabled && !result && (
        <p className="text-xs text-zinc-500">{t("ai.portfolio.empty")}</p>
      )}

      {!disabled && !result && !errorKey && !loading && (
        <p className="text-xs text-zinc-500">{t("ai.portfolio.idle")}</p>
      )}

      {errorKey && <p className="mt-2 text-xs text-amber-700">{t(errorKey)}</p>}

      {result && !errorKey && (
        <>
          {result.ordering &&
            (result.ordering.artworkIds ?? []).length > 0 && (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  {t("ai.portfolio.orderingTitle")}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-700">
                  {stripOpaqueIdsFromCopilotText(result.ordering.rationale)}
                </p>
                <ol className="mt-2 flex flex-col gap-1 text-xs text-zinc-700">
                  {result.ordering.artworkIds.map((id, i) => (
                    <li key={id}>
                      <span className="mr-1 text-zinc-500">{i + 1}.</span>
                      <Link
                        href={`/artwork/${id}`}
                        onClick={() => {
                          markAiAccepted(aiEventId, {
                            feature: "portfolio_copilot",
                            via: "link",
                          });
                        }}
                        className="text-zinc-800 hover:underline"
                      >
                        {titleForChip(id, i)}
                      </Link>
                    </li>
                  ))}
                </ol>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const text = (result.ordering?.artworkIds ?? [])
                        .map(
                          (id, i) =>
                            `${i + 1}. ${titleForChip(id, i)} (/artwork/${id})`,
                        )
                        .join("\n");
                      copyToClipboard(text);
                      markAiAccepted(aiEventId, {
                        feature: "portfolio_copilot",
                        via: "copy",
                      });
                    }}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500"
                  >
                    {t("ai.portfolio.copyChecklist")}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">
                  {t("ai.portfolio.orderingHint")}
                </p>
              </div>
            )}

          {grouped.length === 0 ? (
            <p className="text-xs text-zinc-500">{t("ai.portfolio.empty")}</p>
          ) : (
            <div className="mt-3 flex flex-col gap-4">
              {grouped.map(([kind, items]) => (
                <div key={kind}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    {t(KIND_LABEL[kind])}
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {items.map((s) => {
                      const isReviewed = !!reviewed[s.id];
                      return (
                        <li
                          key={s.id}
                          className={`rounded-xl border p-3 transition ${
                            isReviewed
                              ? "border-zinc-200 bg-zinc-50 opacity-70"
                              : "border-zinc-200 bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Chip tone="muted">{t(KIND_LABEL[s.kind])}</Chip>
                            <p className="text-sm font-medium text-zinc-900">
                              {stripOpaqueIdsFromCopilotText(s.title)}
                            </p>
                          </div>
                          {s.detail && (
                            <p className="mt-1 text-xs text-zinc-600">
                              {stripOpaqueIdsFromCopilotText(s.detail)}
                            </p>
                          )}
                          {(s.artworkIds ?? []).length > 0 && (
                            <div className="mt-2">
                              <p className="text-[11px] text-zinc-500">
                                {t("ai.portfolio.referenced")}
                              </p>
                              <ul className="mt-1 flex flex-wrap gap-1.5">
                                {(s.artworkIds ?? []).map((id, idx) => (
                                  <li key={id}>
                                    <Link
                                      href={`/artwork/${id}`}
                                      onClick={() => {
                                        markAiAccepted(aiEventId, {
                                          feature: "portfolio_copilot",
                                          via: "link",
                                        });
                                      }}
                                      className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-700 hover:border-zinc-500"
                                    >
                                      {titleForChip(id, idx)}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {s.actionHref && (
                              <Link
                                href={s.actionHref}
                                onClick={() => {
                                  markAiAccepted(aiEventId, {
                                    feature: "portfolio_copilot",
                                    via: "link",
                                  });
                                }}
                                className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                              >
                                {resolvePortfolioActionLabel(
                                  s.actionHref,
                                  s.actionLabel,
                                  t,
                                )}
                              </Link>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const text = [
                                  stripOpaqueIdsFromCopilotText(s.title),
                                  s.detail ? stripOpaqueIdsFromCopilotText(s.detail) : "",
                                  ...(s.artworkIds ?? []).map(
                                    (id, idx) =>
                                      `- ${titleForChip(id, idx)} (/artwork/${id})`,
                                  ),
                                ]
                                  .filter(Boolean)
                                  .join("\n");
                                copyToClipboard(text);
                                markAiAccepted(aiEventId, {
                                  feature: "portfolio_copilot",
                                  via: "copy",
                                });
                              }}
                              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500"
                            >
                              {t("ai.portfolio.copyChecklist")}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setReviewed((prev) => ({
                                  ...prev,
                                  [s.id]: !prev[s.id],
                                }))
                              }
                              className="rounded-lg border border-transparent px-2 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800"
                            >
                              {isReviewed
                                ? t("ai.portfolio.reviewed")
                                : t("ai.portfolio.markReviewed")}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SectionFrame>
  );
}
