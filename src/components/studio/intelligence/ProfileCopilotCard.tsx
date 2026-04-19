"use client";

import Link from "next/link";
import { useState } from "react";
import { SectionFrame } from "@/components/ds/SectionFrame";
import { SectionTitle } from "@/components/ds/SectionTitle";
import { useT } from "@/lib/i18n/useT";
import { aiApi, acceptAiEvent } from "@/lib/ai/browser";
import { logBetaEvent } from "@/lib/beta/logEvent";
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

  const reason = result?.degraded ? result.reason : null;
  const errorKey = reason
    ? reason === "cap"
      ? "ai.error.softCap"
      : reason === "no_key"
        ? "ai.error.unavailable"
        : "ai.error.tryLater"
    : null;

  return (
    <SectionFrame padding="md" noMargin>
      <SectionTitle
        eyebrow={t("ai.profile.card.title")}
        action={
          <button
            type="button"
            onClick={trigger}
            disabled={loading}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500 disabled:opacity-60"
            title={t("ai.disclosure.tooltip")}
          >
            {loading ? t("ai.state.loading") : t("ai.profile.improveCta")}
          </button>
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
          {(result.suggestions ?? []).length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("ai.profile.suggestionsTitle")}
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {result.suggestions.map((s) => (
                  <SuggestionRow key={s.id} suggestion={s} aiEventId={aiEventId} />
                ))}
              </ul>
            </div>
          )}
          {result.suggestions?.length === 0 && result.missing?.length === 0 && (
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
    void acceptAiEvent(aiEventId);
    void logBetaEvent("ai_accepted", { feature: "profile_copilot", id: suggestion.id });
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
