"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/useT";
import type { MessageKey } from "@/lib/i18n/messages";
import { aiApi } from "@/lib/ai/browser";
import { markAiAccepted } from "@/lib/ai/accept";
import { aiErrorKey } from "@/components/studio/intelligence/aiCardState";
import { copyToClipboard } from "@/components/ai/AiDraftPanel";
import type {
  BoardPitchPackDraft,
  BoardPitchPackDraftKind,
  BoardPitchPackResult,
} from "@/lib/ai/types";

type Props = {
  boardId: string;
};

const KIND_LABEL: Record<BoardPitchPackDraftKind, MessageKey> = {
  summary: "boards.pitchPack.kind.summary",
  outreach: "boards.pitchPack.kind.outreach",
  wall_text: "boards.pitchPack.kind.wall_text",
};

/**
 * P1-A — Board Pitch Pack panel.
 *
 * Renders as a calm, collapsed CTA on the board detail page; only fires
 * the model on explicit click. Outputs are copy-only — Abstract never
 * pastes anything back into the board, never sends outreach. The panel
 * never displays price / collection info; the API also never sends it.
 */
export function BoardPitchPackPanel({ boardId }: Props) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BoardPitchPackResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const trigger = async () => {
    setLoading(true);
    setCopiedKey(null);
    const res = await aiApi.boardPitchPack({ boardId, locale });
    setResult(res);
    setLoading(false);
  };

  const errorKey = aiErrorKey(result);
  const aiEventId = result?.aiEventId ?? null;
  const drafts: BoardPitchPackDraft[] = (result?.drafts ?? []).filter(
    (d) => d && typeof d.body === "string" && d.body.trim().length > 0,
  );
  const perWork = (result?.perWork ?? []).filter(
    (p) => p && typeof p.line === "string" && p.line.trim().length > 0,
  );
  const missingInfo = (result?.missingInfo ?? []).filter(
    (m) => typeof m === "string" && m.trim().length > 0,
  );

  const onCopy = (key: string, text: string) => {
    copyToClipboard(text);
    setCopiedKey(key);
    void markAiAccepted(aiEventId, { feature: "board_pitch_pack", via: "copy" });
    setTimeout(() => setCopiedKey((v) => (v === key ? null : v)), 1500);
  };

  return (
    <section className="mb-6 rounded-xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50/60 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900">
            {t("boards.pitchPack.title")}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {t("boards.pitchPack.hint")}
          </p>
        </div>
        <span className="shrink-0 text-xs text-zinc-500">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={trigger}
              disabled={loading}
              className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading
                ? t("boards.pitchPack.loading")
                : drafts.length > 0
                  ? t("boards.pitchPack.regenerate")
                  : t("boards.pitchPack.cta")}
            </button>
            <span className="text-[11px] text-zinc-500">
              {t("boards.pitchPack.disclaimer")}
            </span>
          </div>

          {errorKey && (
            <p className="text-xs text-amber-700" role="alert">
              {t(errorKey)}
            </p>
          )}

          {(result?.summary || result?.throughline) && (
            <div className="rounded border border-zinc-200 bg-white p-3 text-sm">
              {result?.summary && (
                <div className="mb-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    {t("boards.pitchPack.summaryLabel")}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-zinc-800">{result.summary}</p>
                </div>
              )}
              {result?.throughline && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    {t("boards.pitchPack.throughlineLabel")}
                  </p>
                  <p className="mt-1 text-zinc-800">{result.throughline}</p>
                </div>
              )}
            </div>
          )}

          {missingInfo.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">
                {t("boards.pitchPack.missingInfoLabel")}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900">
                {missingInfo.slice(0, 5).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          {drafts.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("boards.pitchPack.draftsLabel")}
              </p>
              <ul className="space-y-2">
                {drafts.slice(0, 3).map((draft, idx) => {
                  const key = `draft-${idx}`;
                  const labelKey = KIND_LABEL[draft.kind] ?? "boards.pitchPack.kind.summary";
                  return (
                    <li
                      key={key}
                      className="rounded border border-zinc-200 bg-white p-3 text-sm leading-relaxed text-zinc-800"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-600">
                          {t(labelKey)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onCopy(key, draft.body)}
                          className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-100"
                        >
                          {copiedKey === key
                            ? t("boards.pitchPack.copied")
                            : t("boards.pitchPack.copy")}
                        </button>
                      </div>
                      <p className="whitespace-pre-line">{draft.body}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {perWork.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("boards.pitchPack.perWorkLabel")}
              </p>
              <ul className="space-y-1 text-sm text-zinc-800">
                {perWork.slice(0, 6).map((p, i) => {
                  const key = `pw-${i}`;
                  return (
                    <li
                      key={key}
                      className="flex items-start justify-between gap-2 rounded border border-zinc-200 bg-white px-3 py-2"
                    >
                      <span className="flex-1">{p.line}</span>
                      <button
                        type="button"
                        onClick={() => onCopy(key, p.line)}
                        className="shrink-0 rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-100"
                      >
                        {copiedKey === key
                          ? t("boards.pitchPack.copied")
                          : t("boards.pitchPack.copy")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
