"use client";

import { useState } from "react";
import { SectionFrame } from "@/components/ds/SectionFrame";
import { SectionTitle } from "@/components/ds/SectionTitle";
import { useT } from "@/lib/i18n/useT";
import { aiApi } from "@/lib/ai/browser";
import { logBetaEvent } from "@/lib/beta/logEvent";
import { AiDraftPanel, copyToClipboard } from "./AiDraftPanel";
import type { ExhibitionDraftResult } from "@/lib/ai/types";
import type { ExhibitionDraftInput } from "@/lib/ai/contexts";

type Kind = ExhibitionDraftInput["kind"];

type Props = {
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  venueLabel?: string | null;
  curatorLabel?: string | null;
  hostLabel?: string | null;
  works?: Array<{ id: string; title?: string | null; year?: string | number | null; medium?: string | null }>;
  onApplyTitle?: (text: string) => void;
};

const KIND_LABEL_KEY: Record<Kind, string> = {
  title: "ai.exhibition.titleSuggestCta",
  description: "ai.exhibition.descriptionCta",
  wall_text: "ai.exhibition.wallTextCta",
  invite_blurb: "ai.exhibition.inviteCta",
};

export function ExhibitionDraftAssist({
  title,
  startDate,
  endDate,
  venueLabel,
  curatorLabel,
  hostLabel,
  works,
  onApplyTitle,
}: Props) {
  const { t } = useT();
  const [activeKind, setActiveKind] = useState<Kind | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExhibitionDraftResult | null>(null);

  const hasFewWorks = (works?.length ?? 0) === 0;

  const trigger = async (kind: Kind) => {
    setActiveKind(kind);
    setLoading(true);
    setResult(null);
    const res = await aiApi.exhibitionDraft({
      exhibition: {
        kind,
        title,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        venueLabel: venueLabel ?? null,
        curatorLabel: curatorLabel ?? null,
        hostLabel: hostLabel ?? null,
        locale: "ko",
        works,
      },
    });
    setResult(res);
    setLoading(false);
  };

  return (
    <SectionFrame tone="muted" padding="md" noMargin>
      <SectionTitle eyebrow={t("ai.exhibition.title")} size="sm">
        {t("ai.exhibition.subtitle")}
      </SectionTitle>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(KIND_LABEL_KEY) as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => void trigger(k)}
            disabled={loading}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              activeKind === k
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
            } disabled:opacity-60`}
            title={t("ai.disclosure.tooltip")}
          >
            {t(KIND_LABEL_KEY[k])}
          </button>
        ))}
      </div>

      {hasFewWorks && !result && (
        <p className="mt-2 text-[11px] text-zinc-500">
          {t("ai.exhibition.emptyWorksHint")}
        </p>
      )}

      {(loading || result) && (
        <div className="mt-3">
          <AiDraftPanel
            loading={loading}
            degraded={result ?? undefined}
            drafts={result?.drafts ?? []}
            onApply={
              result?.kind === "title" && onApplyTitle
                ? (text) => {
                    onApplyTitle(text);
                    void logBetaEvent("ai_accepted", {
                      feature: "exhibition_draft",
                      kind: result.kind,
                    });
                  }
                : undefined
            }
            onCopy={(text) => {
              copyToClipboard(text);
              void logBetaEvent("ai_accepted", {
                feature: "exhibition_draft",
                kind: result?.kind ?? activeKind,
                via: "copy",
              });
            }}
            applyLabelKey="ai.exhibition.applyTitle"
            copyLabelKey="ai.exhibition.copy"
          />
        </div>
      )}
    </SectionFrame>
  );
}
