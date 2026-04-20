"use client";

import Link from "next/link";
import { useState } from "react";
import { SectionFrame } from "@/components/ds/SectionFrame";
import { SectionTitle } from "@/components/ds/SectionTitle";
import { useT } from "@/lib/i18n/useT";
import { aiApi } from "@/lib/ai/browser";
import { markAiAccepted } from "@/lib/ai/accept";
import { aiErrorKey } from "./aiCardState";
import { copyToClipboard } from "@/components/ai/AiDraftPanel";
import type {
  ProfileSuggestionsResult,
  ProfileSuggestion,
} from "@/lib/ai/types";

type Props = {
  completeness: number | null;
  profileInput: Record<string, unknown>;
};

export function ProfileCopilotCard({ completeness, profileInput }: Props) {
  const { t } = useT();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProfileSuggestionsResult | null>(null);

  const trigger = async () => {
    setLoading(true);
    const res = await aiApi.profileCopilot({ profile: profileInput });
    setResult(res);
    setLoading(false);
  };

  const aiEventId = result?.aiEventId ?? null;
  const errorKey = aiErrorKey(result);

  const filteredSuggestions = (result?.suggestions ?? []).filter((s) => {
    const text = `${s.title ?? ""} ${s.detail ?? ""}`.toLowerCase();
    return !(
      /username|아이디/.test(text) ||
      /\brole\b|역할/.test(text) ||
      /\bpublic\b|\bprivate\b|공개|비공개|가시성|visibility/.test(text)
    );
  });

  return (
    <SectionFrame padding="md" noMargin>
      <SectionTitle
        eyebrow={t("ai.profile.card.title")}
        action={
          <div className="flex items-center gap-2">
            {result && (
              <button
                type="button"
                onClick={() => setResult(null)}
                className="rounded-lg border border-transparent px-2 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800"
              >
                {t("ai.action.dismiss")}
              </button>
            )}
            <button
              type="button"
              onClick={trigger}
              disabled={loading}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500 disabled:opacity-60"
              title={t("ai.disclosure.tooltip")}
            >
              {loading ? t("ai.state.loading") : t("ai.profile.improveCta")}
            </button>
          </div>
        }
      >
        {t("ai.profile.card.subtitle")}
      </SectionTitle>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-zinc-900">
          {completeness != null ? `${Math.round(completeness)}%` : "—"}
        </span>
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
          {t("ai.profile.completeness")}
        </span>
      </div>

      {!result && !errorKey && !loading && (
        <p className="mt-3 text-xs text-zinc-500">{t("ai.profile.idle")}</p>
      )}

      {errorKey && (
        <p className="mt-3 text-xs text-amber-700">{t(errorKey)}</p>
      )}

      {result && !errorKey && (
        <>
          {result.missing?.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("ai.profile.missingTitle")}
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-700">
                {result.missing.map((m, i) => (
                  <li key={i} className="leading-snug">• {m}</li>
                ))}
              </ul>
            </div>
          )}
          {filteredSuggestions.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("ai.profile.suggestionsTitle")}
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {filteredSuggestions.map((s) => (
                  <SuggestionRow key={s.id} suggestion={s} aiEventId={aiEventId} />
                ))}
              </ul>
            </div>
          )}
          {(result.bioDrafts ?? []).length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("ai.profile.bioDraftsTitle")}
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {(result.bioDrafts ?? []).map((draft, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-zinc-200 bg-white p-3"
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                      {draft}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          copyToClipboard(draft);
                          markAiAccepted(aiEventId, {
                            feature: "profile_copilot",
                            via: "copy",
                          });
                        }}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500"
                      >
                        {t("ai.profile.copyDraft")}
                      </button>
                      <Link
                        href="/settings"
                        onClick={() => {
                          markAiAccepted(aiEventId, {
                            feature: "profile_copilot",
                            via: "link",
                          });
                        }}
                        className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                      >
                        {t("ai.profile.openSettings")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-zinc-500">
                {t("ai.profile.bioDraftsHint")}
              </p>
            </div>
          )}
          {(result.headlineDrafts ?? []).length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("ai.profile.headlineDraftsTitle")}
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {(result.headlineDrafts ?? []).map((line, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3"
                  >
                    <p className="text-sm text-zinc-800">{line}</p>
                    <button
                      type="button"
                      onClick={() => {
                        copyToClipboard(line);
                        markAiAccepted(aiEventId, {
                          feature: "profile_copilot",
                          via: "copy",
                        });
                      }}
                      className="shrink-0 rounded-lg border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:border-zinc-500"
                    >
                      {t("ai.profile.copyDraft")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.discoverabilityRationale && (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("ai.profile.discoverabilityTitle")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-700">
                {result.discoverabilityRationale}
              </p>
            </div>
          )}
          {filteredSuggestions.length === 0 &&
            result.missing?.length === 0 &&
            (result.bioDrafts ?? []).length === 0 &&
            (result.headlineDrafts ?? []).length === 0 &&
            !result.discoverabilityRationale && (
              <p className="mt-3 text-xs text-zinc-500">
                {t("ai.profile.missingEmpty")}
              </p>
            )}
        </>
      )}
    </SectionFrame>
  );
}

function SuggestionRow({
  suggestion,
  aiEventId,
}: {
  suggestion: ProfileSuggestion;
  aiEventId: string | null;
}) {
  const { t } = useT();
  const onAccept = () => {
    markAiAccepted(aiEventId, { feature: "profile_copilot", via: "link" });
  };
  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-3">
      <p className="text-sm font-medium text-zinc-900">{suggestion.title}</p>
      {suggestion.detail && (
        <p className="mt-1 text-xs text-zinc-600">{suggestion.detail}</p>
      )}
      {suggestion.actionHref && (
        <div className="mt-2">
          <Link
            href={suggestion.actionHref}
            onClick={onAccept}
            className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
          >
            {suggestion.actionLabel || t("ai.action.apply")}
          </Link>
        </div>
      )}
    </li>
  );
}
