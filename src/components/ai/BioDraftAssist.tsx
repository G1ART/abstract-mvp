"use client";

import { useState } from "react";
import { Chip } from "@/components/ds/Chip";
import { useT } from "@/lib/i18n/useT";
import { aiApi, acceptAiEvent } from "@/lib/ai/browser";
import { logBetaEvent } from "@/lib/beta/logEvent";
import { readTone, writeTone } from "@/lib/ai/tonePrefs";
import { AiDraftPanel, copyToClipboard } from "./AiDraftPanel";
import type { BioDraftResult } from "@/lib/ai/types";

type Tone = "concise" | "warm" | "curatorial";
const TONES: readonly Tone[] = ["concise", "warm", "curatorial"] as const;

type Props = {
  currentBio: string;
  displayName: string | null;
  role: string | null;
  themes: string[];
  mediums: string[];
  city: string | null;
  selectedArtworks?: Array<{ id: string; title?: string | null; year?: string | number | null; medium?: string | null }>;
  onApply: (text: string) => void;
};

export function BioDraftAssist({
  currentBio,
  displayName,
  role,
  themes,
  mediums,
  city,
  selectedArtworks,
  onApply,
}: Props) {
  const { t, locale } = useT();
  const [tone, setTone] = useState<Tone>(() => readTone<Tone>("bio", TONES, "concise"));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BioDraftResult | null>(null);

  const updateTone = (next: Tone) => {
    setTone(next);
    writeTone("bio", next);
  };

  const weakContext = themes.length === 0 && mediums.length === 0 && !city;

  const trigger = async () => {
    setLoading(true);
    const res = await aiApi.bioDraft({
      bio: {
        tone,
        display_name: displayName,
        role,
        themes,
        mediums,
        city,
        selectedArtworks,
        locale,
      },
    });
    setResult(res);
    setLoading(false);
  };

  const handleApply = (text: string) => {
    onApply(text);
    void acceptAiEvent(result?.aiEventId);
    void logBetaEvent("ai_accepted", { feature: "bio_draft", tone });
  };

  const handleCopy = (text: string) => {
    copyToClipboard(text);
    void acceptAiEvent(result?.aiEventId);
    void logBetaEvent("ai_accepted", { feature: "bio_draft", tone, via: "copy" });
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
          {t("ai.bio.panel.title")}
        </span>
        {TONES.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => updateTone(opt)}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone === opt ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"}`}
          >
            {t(`ai.bio.tone${opt.charAt(0).toUpperCase() + opt.slice(1)}` as never)}
          </button>
        ))}
        <button
          type="button"
          onClick={trigger}
          disabled={loading}
          className="ml-auto rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          title={t("ai.disclosure.tooltip")}
        >
          {loading
            ? t("ai.state.loading")
            : result
              ? t("ai.bio.refreshCta")
              : t("ai.bio.draftCta")}
        </button>
      </div>

      {weakContext && (
        <div>
          <Chip tone="muted">{t("ai.bio.softHint")}</Chip>
        </div>
      )}

      {(loading || result) && (
        <AiDraftPanel
          title={t("ai.bio.panel.title")}
          hint={t("ai.bio.panel.hint")}
          loading={loading}
          degraded={result ?? undefined}
          drafts={result?.drafts ?? []}
          currentValue={currentBio}
          applyMode="auto"
          onApply={handleApply}
          onCopy={handleCopy}
          onDismiss={() => setResult(null)}
        />
      )}
    </div>
  );
}
