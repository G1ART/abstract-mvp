"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/useT";
import { aiApi } from "@/lib/ai/browser";
import { markAiAccepted } from "@/lib/ai/accept";
import { AiCopyButton, AiStateBlock } from "@/components/ai/primitives";
import type { ProfileSuggestionsResult } from "@/lib/ai/types";

type ProfileInputForStatement = {
  display_name?: string | null;
  username?: string | null;
  role?: string | null;
  bio?: string | null;
  themes?: string[] | null;
  mediums?: string[] | null;
  // QA P0.5-B (row 24): styles 도 statement prompt 컨텍스트에 포함시킨다.
  styles?: string[] | null;
  city?: string | null;
  locale?: string | null;
  currentStatement?: string | null;
  themesDetail?: string | null;
  /**
   * Session-scope negative list. /settings 가 직전 마운트 시점에 들고 있던
   * themes/mediums/styles 와 비교해, 사용자가 실제로 빼낸 칩 슬러그만
   * 모아 보낸다. statement 프롬프트가 current_statement 의 옛 어휘를
   * 그대로 끌어다 쓰는 경향을 차단한다.
   */
  excludedKeywords?: string[] | null;
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

  const trigger = async () => {
    setLoading(true);
    const res = await aiApi.profileCopilot({
      profile: { ...profileInput, mode: "statement" },
    });
    setResult(res);
    setLoading(false);
  };

  const drafts = (result?.statementDrafts ?? []).filter((d) => typeof d === "string" && d.trim().length > 0);
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
            ? t("ai.common.loading")
            : drafts.length > 0
              ? t("profile.statement.assist.regenerate")
              : t("profile.statement.assist.cta")}
        </button>
      </div>

      <div className="mt-2">
        <AiStateBlock loading={loading} result={result} />
      </div>

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
                <AiCopyButton
                  text={draft}
                  feature="profile_copilot"
                  aiEventId={aiEventId}
                  labelKey="profile.statement.assist.copy"
                  copiedLabelKey="profile.statement.assist.copied"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
