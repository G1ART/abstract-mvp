"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/useT";
import { aiApi } from "@/lib/ai/browser";
import { markAiAccepted } from "@/lib/ai/accept";
import { AiDraftPanel, copyToClipboard } from "./AiDraftPanel";
import type { IntroMessageDraftResult } from "@/lib/ai/types";
import type { IntroMessageInput } from "@/lib/ai/contexts";

type Props = {
  me: IntroMessageInput["me"];
  recipient: IntroMessageInput["recipient"] & { id?: string };
  variant?: "button" | "inline";
  /**
   * Wave 2: when the user opens the inline draft from a Matchmaker
   * suggestion we open immediately without waiting for the button press.
   */
  autoOpen?: boolean;
};

export function IntroMessageAssist({ me, recipient, variant = "button", autoOpen = false }: Props) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(autoOpen);
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
            markAiAccepted(result?.aiEventId, {
              feature: "intro_message_draft",
              via: "copy",
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
