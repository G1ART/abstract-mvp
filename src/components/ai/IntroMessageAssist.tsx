"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/useT";
import { aiApi, acceptAiEvent } from "@/lib/ai/browser";
import { logBetaEvent } from "@/lib/beta/logEvent";
import { AiDraftPanel, copyToClipboard } from "./AiDraftPanel";
import type { IntroMessageDraftResult } from "@/lib/ai/types";
import type { IntroMessageInput } from "@/lib/ai/contexts";

type Props = {
  me: IntroMessageInput["me"];
  recipient: IntroMessageInput["recipient"] & { id?: string };
  variant?: "button" | "inline";
};

export function IntroMessageAssist({ me, recipient, variant = "button" }: Props) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntroMessageDraftResult | null>(null);

  const trigger = async () => {
    if (!open) setOpen(true);
    setLoading(true);
    const res = await aiApi.introMessageDraft({
      intro: { me, recipient, locale },
    });
    setResult(res);
    setLoading(false);
  };

  if (variant === "button" && !open) {
    return (
      <button
        type="button"
        onClick={trigger}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500"
        title={t("ai.disclosure.tooltip")}
      >
        {t("ai.intro.draftCta")}
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {(loading || result) && (
        <AiDraftPanel
          title={t("ai.intro.panel.title")}
          hint={t("ai.intro.panel.hint")}
          loading={loading}
          degraded={result ?? undefined}
          drafts={result?.drafts ?? []}
          applyMode="link"
          onCopy={(text) => {
            copyToClipboard(text);
            void acceptAiEvent(result?.aiEventId);
            void logBetaEvent("ai_accepted", {
              feature: "intro_message_draft",
              recipientId: recipient.id,
            });
          }}
          onDismiss={() => {
            setResult(null);
            setOpen(false);
          }}
        />
      )}
      <button
        type="button"
        onClick={trigger}
        disabled={loading}
        className="self-start rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500 disabled:opacity-60"
      >
        {loading ? t("ai.state.loading") : t("ai.action.refresh")}
      </button>
    </div>
  );
}
