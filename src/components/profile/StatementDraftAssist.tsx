"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/useT";
import { aiApi } from "@/lib/ai/browser";
import { markAiAccepted } from "@/lib/ai/accept";
import { aiErrorKey } from "@/components/studio/intelligence/aiCardState";
import { copyToClipboard } from "@/components/ai/AiDraftPanel";
import type { ProfileSuggestionsResult } from "@/lib/ai/types";

type ProfileInputForStatement = {
  display_name?: string | null;
  username?: string | null;
  role?: string | null;
  bio?: string | null;
  themes?: string[] | null;
  mediums?: string[] | null;
  city?: string | null;
  locale?: string | null;
  currentStatement?: string | null;
  themesDetail?: string | null;
  selectedArtworks?: { title?: string | null; year?: string | number | null; medium?: string | null }[];
};

type Props = {
  /** Snapshot of profile-level signals the prompt should ground in. */
  profileInput: ProfileInputForStatement;
  /** Called when the artist taps "이 초안으로 사용". The settings textarea
   *  swaps to the chosen draft; auto-save still runs on the existing
   *  `onBlur` path so we never write bypass the SSOT RPC. */
  onUseDraft: (draft: string) => void;
};

/**
 * Statement 초안 도움 — extension of the existing Profile Copilot route
 * (mode=statement). We never auto-apply: the artist explicitly chooses
 * "사용" or "복사". markAiAccepted flips ai_events.accepted on "사용" so
 * eval pipelines can grade the draft accuracy.
 */
export function StatementDraftAssist({ profileInput, onUseDraft }: Props) {
  const { t } = useT();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProfileSuggestionsResult | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const trigger = async () => {
    setLoading(true);
    setCopiedIdx(null);
    const res = await aiApi.profileCopilot({
      profile: { ...profileInput, mode: "statement" },
    });
    setResult(res);
    setLoading(false);
  };

  const drafts = (result?.statementDrafts ?? []).filter((d) => typeof d === "string" && d.trim().length > 0);
  const errorKey = aiErrorKey(result);
  const aiEventId = result?.aiEventId ?? null;

  return (
    <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-zinc-800">
            {t("profile.statement.assist.title")}
          </p>
          <p className="text-[11px] text-zinc-500">
            {t("profile.statement.assist.hint")}
          </p>
        </div>
        <button
          type="button"
          onClick={trigger}
          disabled={loading}
          className="rounded border border-zinc-900 bg-white px-3 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-50"
        >
          {loading
            ? t("profile.statement.assist.loading")
            : drafts.length > 0
              ? t("profile.statement.assist.regenerate")
              : t("profile.statement.assist.cta")}
        </button>
      </div>

      {errorKey && (
        <p className="mt-2 text-[11px] text-amber-700" role="alert">
          {t(errorKey)}
        </p>
      )}

      {drafts.length > 0 && (
        <ul className="mt-3 space-y-3">
          {drafts.slice(0, 3).map((draft, idx) => (
            <li
              key={idx}
              className="rounded border border-zinc-200 bg-white p-3 text-sm leading-relaxed text-zinc-800"
            >
              <p className="whitespace-pre-line">{draft}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onUseDraft(draft);
                    void markAiAccepted(aiEventId, { feature: "profile_copilot", via: "apply" });
                  }}
                  className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-white hover:bg-zinc-800"
                >
                  {t("profile.statement.assist.use")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    copyToClipboard(draft);
                    setCopiedIdx(idx);
                    setTimeout(() => setCopiedIdx((v) => (v === idx ? null : v)), 1500);
                  }}
                  className="rounded border border-zinc-300 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-100"
                >
                  {copiedIdx === idx
                    ? t("profile.statement.assist.copied")
                    : t("profile.statement.assist.copy")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
