"use client";

import Link from "next/link";
import { useState } from "react";
import { SectionFrame } from "@/components/ds/SectionFrame";
import { SectionTitle } from "@/components/ds/SectionTitle";
import { Chip } from "@/components/ds/Chip";
import { useT } from "@/lib/i18n/useT";
import { aiApi } from "@/lib/ai/browser";
import { logBetaEvent } from "@/lib/beta/logEvent";
import type { MessageKey } from "@/lib/i18n/messages";
import type {
  PortfolioSuggestion,
  PortfolioSuggestionsResult,
} from "@/lib/ai/types";

type Props = {
  portfolioInput: Record<string, unknown>;
  artworkCount: number;
};

const KIND_LABEL: Record<PortfolioSuggestion["kind"], MessageKey> = {
  reorder: "ai.portfolio.kind.reorder",
  series: "ai.portfolio.kind.series",
  metadata: "ai.portfolio.kind.metadata",
  exhibition_link: "ai.portfolio.kind.exhibition_link",
};

export function PortfolioCopilotCard({ portfolioInput, artworkCount }: Props) {
  const { t } = useT();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PortfolioSuggestionsResult | null>(null);

  const disabled = artworkCount < 2;

  const trigger = async () => {
    setLoading(true);
    const res = await aiApi.portfolioCopilot({ portfolio: portfolioInput });
    setResult(res);
    setLoading(false);
  };

  const reason = result?.degraded ? result.reason : null;
  const errorKey = reason
    ? reason === "cap"
      ? "ai.error.softCap"
      : reason === "no_key"
        ? "ai.error.unavailable"
        : "ai.error.tryLater"
    : null;

  return (
    <SectionFrame padding="md" noMargin>
      <SectionTitle
        eyebrow={t("ai.portfolio.card.title")}
        action={
          <button
            type="button"
            onClick={trigger}
            disabled={loading || disabled}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500 disabled:opacity-60"
            title={t("ai.disclosure.tooltip")}
          >
            {loading ? t("ai.state.loading") : t("ai.portfolio.cta")}
          </button>
        }
      >
        {t("ai.portfolio.card.subtitle")}
      </SectionTitle>

      {disabled && !result && (
        <p className="text-xs text-zinc-500">{t("ai.portfolio.empty")}</p>
      )}

      {errorKey && <p className="mt-2 text-xs text-amber-700">{t(errorKey)}</p>}

      {result && !errorKey && (
        <>
          {(result.suggestions ?? []).length === 0 ? (
            <p className="text-xs text-zinc-500">{t("ai.portfolio.empty")}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {result.suggestions.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-zinc-200 bg-white p-3"
                >
                  <div className="flex items-center gap-2">
                    <Chip tone="muted">{t(KIND_LABEL[s.kind])}</Chip>
                    <p className="text-sm font-medium text-zinc-900">{s.title}</p>
                  </div>
                  {s.detail && (
                    <p className="mt-1 text-xs text-zinc-600">{s.detail}</p>
                  )}
                  {s.actionHref && (
                    <div className="mt-2">
                      <Link
                        href={s.actionHref}
                        onClick={() =>
                          void logBetaEvent("ai_accepted", {
                            feature: "portfolio_copilot",
                            id: s.id,
                          })
                        }
                        className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                      >
                        {s.actionLabel || t("ai.action.apply")}
                      </Link>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </SectionFrame>
  );
}
