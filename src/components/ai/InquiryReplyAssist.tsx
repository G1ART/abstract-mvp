"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/useT";
import { aiApi } from "@/lib/ai/browser";
import { logBetaEvent } from "@/lib/beta/logEvent";
import { AiDraftPanel, copyToClipboard } from "./AiDraftPanel";
import type { InquiryReplyDraftResult } from "@/lib/ai/types";
import type { InquiryReplyInput } from "@/lib/ai/contexts";

type Tone = "concise" | "warm" | "curatorial";

type Props = {
  artwork?: {
    title?: string | null;
    year?: string | number | null;
    medium?: string | null;
    artistName?: string | null;
    pricePolicy?: string | null;
  };
  exhibitionTitle?: string | null;
  thread?: Array<{ from: "inquirer" | "owner"; text: string }>;
  onApply: (text: string) => void;
};

export function InquiryReplyAssist({
  artwork,
  exhibitionTitle,
  thread,
  onApply,
}: Props) {
  const { t } = useT();
  const [tone, setTone] = useState<Tone>("warm");
  const [followup, setFollowup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InquiryReplyDraftResult | null>(null);

  const trigger = async () => {
    setLoading(true);
    const body: InquiryReplyInput = {
      tone,
      kind: followup ? "followup" : "reply",
      locale: "ko",
      artwork,
      exhibitionTitle,
      thread,
    };
    const res = await aiApi.inquiryReplyDraft({ inquiry: body });
    setResult(res);
    setLoading(false);
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
          {t("ai.inquiry.panel.title")}
        </span>
        {(["concise", "warm", "curatorial"] as Tone[]).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setTone(opt)}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone === opt ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"}`}
          >
            {t(`ai.inquiry.tone${opt.charAt(0).toUpperCase() + opt.slice(1)}` as never)}
          </button>
        ))}
        <label className="flex items-center gap-1 text-[11px] text-zinc-600">
          <input
            type="checkbox"
            checked={followup}
            onChange={(e) => setFollowup(e.target.checked)}
          />
          {t("ai.inquiry.followupToggle")}
        </label>
        <button
          type="button"
          onClick={trigger}
          disabled={loading}
          className="ml-auto rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          title={t("ai.disclosure.tooltip")}
        >
          {loading
            ? t("ai.state.loading")
            : followup
              ? t("ai.inquiry.followupCta")
              : t("ai.inquiry.replyDraftCta")}
        </button>
      </div>
      {(loading || result) && (
        <AiDraftPanel
          hint={t("ai.inquiry.panel.hint")}
          loading={loading}
          degraded={result ?? undefined}
          drafts={result?.drafts ?? []}
          onApply={(text) => {
            onApply(text);
            void logBetaEvent("ai_accepted", {
              feature: "inquiry_reply_draft",
              kind: result?.kind ?? (followup ? "followup" : "reply"),
            });
          }}
          onCopy={(text) => copyToClipboard(text)}
          applyLabelKey="ai.inquiry.insert"
        />
      )}
    </div>
  );
}
