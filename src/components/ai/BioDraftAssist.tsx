"use client";

import { useState } from "react";
import { Chip } from "@/components/ds/Chip";
import { useT } from "@/lib/i18n/useT";
import { aiApi } from "@/lib/ai/browser";
import { logBetaEvent } from "@/lib/beta/logEvent";
import { AiDraftPanel, copyToClipboard } from "./AiDraftPanel";
import type { BioDraftResult } from "@/lib/ai/types";

type Tone = "concise" | "warm" | "curatorial";

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
  const { t } = useT();
  const [tone, setTone] = useState<Tone>("concise");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BioDraftResult | null>(null);

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
        locale: "ko",
      },
    });
    setResult(res);
    setLoading(false);
  };

  const handleApply = (text: string) => {
    if (currentBio.trim().length > 0) {
      const ok =
        typeof window === "undefined"
          ? true
          : window.confirm(t("ai.bio.warnOverwrite"));
      if (!ok) return;
    }
    onApply(text);
    void logBetaEvent("ai_accepted", { feature: "bio_draft" });
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
          {t("ai.bio.panel.title")}
        </span>
        <button
          type="button"
          onClick={() => setTone("concise")}
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone === "concise" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"}`}
        >
          {t("ai.bio.toneConcise")}
        </button>
        <button
          type="button"
          onClick={() => setTone("warm")}
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone === "warm" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"}`}
        >
          {t("ai.bio.toneWarm")}
        </button>
        <button
          type="button"
          onClick={() => setTone("curatorial")}
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone === "curatorial" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"}`}
        >
          {t("ai.bio.toneCuratorial")}
        </button>
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
          onApply={handleApply}
          onCopy={(text) => copyToClipboard(text)}
        />
      )}
    </div>
  );
}
