"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import { aiApi } from "@/lib/ai/browser";
import { markAiAccepted } from "@/lib/ai/accept";
import { aiErrorKey } from "@/components/studio/intelligence/aiCardState";
import { copyToClipboard } from "@/components/ai/AiDraftPanel";
import type { DelegationBriefResult } from "@/lib/ai/types";

type Props = {
  /** Effective profile id the operator is acting as. */
  actingAsProfileId: string;
  /** Optional display name for header copy. */
  principalName?: string | null;
};

/**
 * P1-C — Delegation Brief panel.
 *
 * Renders only when the operator is acting as another profile. Shows
 * 2–4 prioritised actions, watch items, and an optional draft note the
 * operator can copy and send to the principal. Nothing is auto-sent.
 *
 * The component never sends any of the operator's own data to the
 * model — only the principal's aggregate counts collected server-side.
 */
export function DelegationBriefPanel({ actingAsProfileId, principalName }: Props) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DelegationBriefResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const trigger = async () => {
    setLoading(true);
    setCopiedKey(null);
    const res = await aiApi.delegationBrief({ actingAsProfileId, locale });
    setResult(res);
    setLoading(false);
  };

  const errorKey = aiErrorKey(result);
  const aiEventId = result?.aiEventId ?? null;
  const priorities = (result?.priorities ?? []).filter(
    (p) => p && typeof p.title === "string" && p.title.trim().length > 0,
  );
  const watchItems = (result?.watchItems ?? []).filter(
    (w) => typeof w === "string" && w.trim().length > 0,
  );
  const draftMessage =
    typeof result?.draftMessage === "string" && result.draftMessage.trim().length > 0
      ? result.draftMessage
      : null;

  const onCopy = (key: string, text: string) => {
    copyToClipboard(text);
    setCopiedKey(key);
    void markAiAccepted(aiEventId, { feature: "delegation_brief", via: "copy" });
    setTimeout(() => setCopiedKey((v) => (v === key ? null : v)), 1500);
  };

  const titleText = principalName
    ? t("delegation.brief.title").replace("{name}", principalName)
    : t("delegation.brief.titleNoName");

  return (
    <section className="mb-4 rounded-xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50/60 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900">{titleText}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{t("delegation.brief.hint")}</p>
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
                ? t("delegation.brief.loading")
                : priorities.length > 0
                  ? t("delegation.brief.regenerate")
                  : t("delegation.brief.cta")}
            </button>
            <span className="text-[11px] text-zinc-500">
              {t("delegation.brief.disclaimer")}
            </span>
          </div>

          {errorKey && (
            <p className="text-xs text-amber-700" role="alert">
              {t(errorKey)}
            </p>
          )}

          {priorities.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("delegation.brief.prioritiesLabel")}
              </p>
              <ul className="space-y-2">
                {priorities.slice(0, 4).map((p) => (
                  <li
                    key={p.id}
                    className="rounded border border-zinc-200 bg-white p-3 text-sm leading-relaxed text-zinc-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{p.title}</p>
                        {p.reason && (
                          <p className="mt-0.5 text-xs text-zinc-600">{p.reason}</p>
                        )}
                      </div>
                      {p.href && (
                        <Link
                          href={p.href}
                          className="shrink-0 rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-100"
                        >
                          {t("delegation.brief.open")}
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {watchItems.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">
                {t("delegation.brief.watchLabel")}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900">
                {watchItems.slice(0, 5).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {draftMessage && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("delegation.brief.draftMessageLabel")}
              </p>
              <div className="rounded border border-zinc-200 bg-white p-3 text-sm leading-relaxed text-zinc-800">
                <p className="whitespace-pre-line">{draftMessage}</p>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onCopy("draftMessage", draftMessage)}
                    className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-100"
                  >
                    {copiedKey === "draftMessage"
                      ? t("delegation.brief.copied")
                      : t("delegation.brief.copy")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
