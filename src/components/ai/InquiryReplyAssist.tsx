"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/useT";
import type { MessageKey } from "@/lib/i18n/messages";
import { aiApi } from "@/lib/ai/browser";
import { readTone, writeTone } from "@/lib/ai/tonePrefs";
import { AiDraftPanel, copyToClipboard } from "./AiDraftPanel";
import type { InquiryReplyDraftResult } from "@/lib/ai/types";
import type { InquiryReplyInput } from "@/lib/ai/contexts";

type Tone = "concise" | "warm" | "curatorial";
const TONES: readonly Tone[] = ["concise", "warm", "curatorial"] as const;

const TONE_I18N: Record<Tone, "ai.inquiry.toneConcise" | "ai.inquiry.toneWarm" | "ai.inquiry.toneCuratorial"> = {
  concise: "ai.inquiry.toneConcise",
  warm: "ai.inquiry.toneWarm",
  curatorial: "ai.inquiry.toneCuratorial",
};

type LengthPref = "short" | "long";
const LENGTHS: readonly LengthPref[] = ["short", "long"] as const;

const LENGTH_I18N: Record<LengthPref, "ai.inquiry.length.short" | "ai.inquiry.length.long"> = {
  short: "ai.inquiry.length.short",
  long: "ai.inquiry.length.long",
};

const INQUIRY_INTENT_LABEL: Record<string, MessageKey> = {
  price: "ai.inquiry.intent.price",
  availability: "ai.inquiry.intent.availability",
  shipping: "ai.inquiry.intent.shipping",
  exhibition: "ai.inquiry.intent.exhibition",
  compliment: "ai.inquiry.intent.compliment",
  collaboration: "ai.inquiry.intent.collaboration",
  general: "ai.inquiry.intent.general",
};

const INQUIRY_PRIORITY_LABEL: Record<
  "normal" | "time_sensitive" | "opportunity",
  MessageKey
> = {
  normal: "ai.inquiry.triagePriority.normal",
  time_sensitive: "ai.inquiry.triagePriority.time_sensitive",
  opportunity: "ai.inquiry.triagePriority.opportunity",
};

type Props = {
  artwork?: {
    title?: string | null;
    year?: string | number | null;
    medium?: string | null;
    artistName?: string | null;
    pricePolicy?: string | null;
  };
  exhibitionTitle?: string | null;
  thread?: Array<{ from: "inquirer" | "owner"; text: string }>;
  /** Current textarea value — lets the panel decide Insert vs Replace. */
  currentReply?: string;
  /**
   * Wave 2: inquiry acceptance is "send-after-edit" — the parent receives
   * the aiEventId of the draft the user just adopted so it can call
   * `markAiAccepted(..., { via: "send" })` **after** the reply actually
   * leaves the inbox. We never mark accepted on apply/copy for inquiries.
   */
  onApply: (text: string, aiEventId: string | null) => void;
};

export function InquiryReplyAssist({
  artwork,
  exhibitionTitle,
  thread,
  currentReply,
  onApply,
}: Props) {
  const { t, locale } = useT();
  const [tone, setTone] = useState<Tone>(() => readTone<Tone>("inquiry", TONES, "warm"));
  const [lengthPref, setLengthPref] = useState<LengthPref>(
    () => readTone<LengthPref>("inquiryLength", LENGTHS, "short"),
  );
  const [followup, setFollowup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InquiryReplyDraftResult | null>(null);

  const updateTone = (next: Tone) => {
    setTone(next);
    writeTone("inquiry", next);
  };

  const updateLength = (next: LengthPref) => {
    setLengthPref(next);
    writeTone("inquiryLength", next);
  };

  const trigger = async () => {
    setLoading(true);
    const body: InquiryReplyInput = {
      tone,
      kind: followup ? "followup" : "reply",
      locale,
      artwork,
      exhibitionTitle,
      thread,
      lengthPreference: lengthPref,
    };
    const res = await aiApi.inquiryReplyDraft({ inquiry: body });
    setResult(res);
    setLoading(false);
  };

  const draftBodies = (result?.drafts ?? []).map((d) =>
    typeof d === "string" ? d : d.body,
  );
  const draftLabels = (result?.drafts ?? []).map((d) => {
    if (typeof d === "string") return null;
    if (d.length === "short") return t("ai.inquiry.length.short");
    if (d.length === "long") return t("ai.inquiry.length.long");
    return null;
  });

  const triage = result?.triage;
  const rawIntent = triage?.intent?.trim().toLowerCase();
  const triageIntent =
    rawIntent && INQUIRY_INTENT_LABEL[rawIntent]
      ? t(INQUIRY_INTENT_LABEL[rawIntent])
      : triage?.intent?.trim() || null;
  const triagePriority =
    triage?.priority === "normal" ||
    triage?.priority === "time_sensitive" ||
    triage?.priority === "opportunity"
      ? triage.priority
      : null;
  const triageMissing = (triage?.missingInfo ?? [])
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 120))
    .slice(0, 5);

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
          {t("ai.inquiry.panel.title")}
        </span>
        {TONES.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => updateTone(opt)}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone === opt ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"}`}
          >
            {t(TONE_I18N[opt])}
          </button>
        ))}
        <span className="ml-1 inline-flex overflow-hidden rounded-full border border-zinc-200 text-[11px]">
          {LENGTHS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => updateLength(opt)}
              className={`px-2 py-0.5 font-medium ${lengthPref === opt ? "bg-zinc-900 text-white" : "bg-white text-zinc-600"}`}
            >
              {t(LENGTH_I18N[opt])}
            </button>
          ))}
        </span>
        <label className="flex items-center gap-1 text-[11px] text-zinc-600">
          <input
            type="checkbox"
            checked={followup}
            onChange={(e) => setFollowup(e.target.checked)}
          />
          {t("ai.inquiry.followupToggle")}
        </label>
        <button
          type="button"
          onClick={trigger}
          disabled={loading}
          className="ml-auto rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          title={t("ai.disclosure.tooltip")}
        >
          {loading
            ? t("ai.state.loading")
            : followup
              ? t("ai.inquiry.followupCta")
              : t("ai.inquiry.replyDraftCta")}
        </button>
      </div>
      {result && !loading && (triageIntent || triagePriority || triageMissing.length > 0) ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/90 px-3 py-2.5 text-xs text-zinc-800">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {t("ai.inquiry.triageTitle")}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {triageIntent ? (
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-200/80">
                {t("ai.inquiry.triageIntent")}: {triageIntent}
              </span>
            ) : null}
            {triagePriority ? (
              <span
                className={
                  triagePriority === "time_sensitive"
                    ? "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-950"
                    : triagePriority === "opportunity"
                      ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-950"
                      : "rounded-full bg-zinc-200/80 px-2 py-0.5 text-[11px] font-medium text-zinc-800"
                }
              >
                {t(INQUIRY_PRIORITY_LABEL[triagePriority])}
              </span>
            ) : null}
          </div>
          {triageMissing.length > 0 ? (
            <div className="mt-2">
              <p className="text-[10px] font-medium text-zinc-500">{t("ai.inquiry.triageMissing")}</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {triageMissing.map((m, i) => (
                  <li
                    key={i}
                    className="rounded-md bg-white/90 px-2 py-0.5 text-[11px] text-zinc-700 ring-1 ring-zinc-200/70"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {(loading || result) && (
        <AiDraftPanel
          hint={t("ai.inquiry.panel.hint")}
          loading={loading}
          degraded={result ?? undefined}
          drafts={draftBodies}
          draftLabels={draftLabels}
          currentValue={currentReply}
          applyMode="auto"
          applyLabelKey="ai.action.useAsReply"
          onApply={(text) => {
            onApply(text, result?.aiEventId ?? null);
          }}
          onCopy={(text) => {
            copyToClipboard(text);
          }}
          onDismiss={() => setResult(null)}
        />
      )}
    </div>
  );
}
