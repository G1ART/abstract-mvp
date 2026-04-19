"use client";

import Link from "next/link";
import { useState } from "react";
import { SectionFrame } from "@/components/ds/SectionFrame";
import { SectionTitle } from "@/components/ds/SectionTitle";
import { useT } from "@/lib/i18n/useT";
import { aiApi, acceptAiEvent } from "@/lib/ai/browser";
import { logBetaEvent } from "@/lib/beta/logEvent";
import type { StudioDigestResult } from "@/lib/ai/types";

type Props = {
  digestInput: Record<string, unknown>;
};

export function WeeklyDigestCard({ digestInput }: Props) {
  const { t } = useT();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StudioDigestResult | null>(null);

  const trigger = async () => {
    setLoading(true);
    const res = await aiApi.studioDigest({ digest: digestInput });
    setResult(res);
    setLoading(false);
  };

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
        eyebrow={t("ai.digest.card.title")}
        action={
          <button
            type="button"
            onClick={trigger}
            disabled={loading}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500 disabled:opacity-60"
            title={t("ai.disclosure.tooltip")}
          >
            {loading ? t("ai.state.loading") : t("ai.digest.cta")}
          </button>
        }
      >
        {t("ai.digest.card.subtitle")}
      </SectionTitle>

      {errorKey && <p className="text-xs text-amber-700">{t(errorKey)}</p>}

      {!result && !errorKey && (
        <p className="text-xs text-zinc-500">{t("ai.digest.empty")}</p>
      )}

      {result && !errorKey && (
        <>
          {result.headline && (
            <p className="text-sm font-medium text-zinc-900">{result.headline}</p>
          )}
          {(result.changes ?? []).length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("ai.digest.changes")}
              </p>
              <ul className="mt-1 flex flex-col gap-1 text-sm text-zinc-700">
                {result.changes.map((c, i) => (
                  <li key={i}>• {c}</li>
                ))}
              </ul>
            </div>
          )}
          {(result.nextActions ?? []).length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("ai.digest.next")}
              </p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {result.nextActions.map((a, i) =>
                  a.href ? (
                    <li key={i}>
                      <Link
                        href={a.href}
                        onClick={() => {
                          void acceptAiEvent(result?.aiEventId ?? null);
                          void logBetaEvent("ai_accepted", {
                            feature: "studio_digest",
                            action: a.label,
                          });
                        }}
                        className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                      >
                        {a.label}
                      </Link>
                    </li>
                  ) : (
                    <li key={i} className="text-xs text-zinc-700">
                      • {a.label}
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}
        </>
      )}
    </SectionFrame>
  );
}
