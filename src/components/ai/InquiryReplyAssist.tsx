"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/useT";
import { aiApi, acceptAiEvent } from "@/lib/ai/browser";
import { logBetaEvent } from "@/lib/beta/logEvent";
import { readTone, writeTone } from "@/lib/ai/tonePrefs";
import { AiDraftPanel, copyToClipboard } from "./AiDraftPanel";
import type { InquiryReplyDraftResult } from "@/lib/ai/types";
import type { InquiryReplyInput } from "@/lib/ai/contexts";

type Tone = "concise" | "warm" | "curatorial";
const TONES: readonly Tone[] = ["concise", "warm", "curatorial"] as const;

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
  /** Current textarea value — lets the panel decide Insert vs Replace. */
  currentReply?: string;
  onApply: (text: string) => void;
};

export function InquiryReplyAssist({
  artwork,
  exhibitionTitle,
  thread,
  currentReply,
  onApply,
}: Props) {
  const { t, locale } = useT();
  const [tone, setTone] = useState<Tone>(() => readTone<Tone>("inquiry", TONES, "warm"));
  const [followup, setFollowup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InquiryReplyDraftResult | null>(null);

  const updateTone = (next: Tone) => {
    setTone(next);
    writeTone("inquiry", next);
  };

  const trigger = async () => {
    setLoading(true);
    const body: InquiryReplyInput = {
      tone,
      kind: followup ? "followup" : "reply",
      locale,
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
        {TONES.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => updateTone(opt)}
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
          currentValue={currentReply}
          applyMode="auto"
          onApply={(text) => {
            onApply(text);
            void acceptAiEvent(result?.aiEventId);
            void logBetaEvent("ai_accepted", {
              feature: "inquiry_reply_draft",
              kind: result?.kind ?? (followup ? "followup" : "reply"),
              tone,
            });
          }}
          onCopy={(text) => {
            copyToClipboard(text);
            void acceptAiEvent(result?.aiEventId);
            void logBetaEvent("ai_accepted", {
              feature: "inquiry_reply_draft",
              via: "copy",
              tone,
            });
          }}
          onDismiss={() => setResult(null)}
        />
      )}
    </div>
  );
}
