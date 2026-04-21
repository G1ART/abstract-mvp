"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/useT";
import { aiApi } from "@/lib/ai/browser";
import { markAiAccepted } from "@/lib/ai/accept";
import { copyToClipboard } from "./AiDraftPanel";
import type { IntroMessageDraftResult } from "@/lib/ai/types";
import type { IntroMessageInput } from "@/lib/ai/contexts";

type Props = {
  me: IntroMessageInput["me"];
  recipient: IntroMessageInput["recipient"] & { id?: string };
  variant?: "button" | "inline";
  autoOpen?: boolean;
};

// ─── Icons ───────────────────────────────────────────────────────────────────

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2 9.5 9H2l6 4.4-2.3 7 6.3-4.5 6.3 4.5-2.3-7L22 9h-7.5Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── Draft item with copy feedback ───────────────────────────────────────────

function DraftItem({
  text,
  onCopy,
  copyLabel,
}: {
  text: string;
  onCopy: () => void;
  copyLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    const id = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(id);
  };

  return (
    <div className="relative rounded-xl border border-zinc-200 bg-white p-4 pr-[4.5rem] hover:border-zinc-300 transition-colors">
      <p className="text-sm leading-relaxed text-zinc-800 whitespace-pre-wrap">{text}</p>
      <button
        type="button"
        onClick={handleCopy}
        className={[
          "absolute right-3 top-3 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all",
          copied
            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
            : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700",
        ].join(" ")}
      >
        {copied ? <CheckIcon /> : null}
        {copied ? "복사됨" : copyLabel}
      </button>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function DraftSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 animate-pulse">
      <div className="h-3 bg-zinc-200 rounded w-full mb-2" />
      <div className="h-3 bg-zinc-200 rounded w-5/6 mb-2" />
      <div className="h-3 bg-zinc-200 rounded w-3/5" />
    </div>
  );
}

// ─── Portal sheet (modal/bottom-sheet) ───────────────────────────────────────

type SheetProps = {
  loading: boolean;
  result: IntroMessageDraftResult | null;
  recipientName: string | null | undefined;
  onRefresh: () => void;
  onClose: () => void;
};

function IntroSheet({ loading, result, recipientName, onRefresh, onClose }: SheetProps) {
  const { t } = useT();

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const drafts = result?.drafts ?? [];
  const isDegraded = Boolean(result?.degraded);

  const errorKey =
    isDegraded && result?.reason
      ? result.reason === "cap"
        ? "ai.error.softCap"
        : result.reason === "no_key"
          ? "ai.error.unavailable"
          : result.reason === "invalid_input"
            ? "ai.error.invalidInput"
            : "ai.error.tryLater"
      : null;

  const hasError = isDegraded && drafts.length === 0 && Boolean(errorKey);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px] animate-sheet-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("ai.intro.panel.title")}
        className="relative z-10 w-full md:w-[480px] md:max-w-[90vw] flex flex-col bg-white rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[82vh] md:max-h-[70vh] animate-sheet-slide-up md:[animation-name:sheet-fade-scale]"
      >
        {/* Drag handle (mobile only) */}
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-zinc-200 md:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white">
              <SparkleIcon />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 leading-tight">
                {t("ai.intro.panel.title")}
              </p>
              {recipientName && (
                <p className="text-xs text-zinc-400 truncate mt-0.5">
                  {recipientName}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
            aria-label="닫기"
          >
            <XIcon />
          </button>
        </div>

        {/* Hint line */}
        <p className="px-5 pb-3 text-xs text-zinc-400">
          {t("ai.intro.panel.hint")}
        </p>

        {/* Divider */}
        <div className="h-px bg-zinc-100" />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
          {loading && (
            <>
              <DraftSkeleton />
              <DraftSkeleton />
            </>
          )}

          {!loading && hasError && errorKey && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-sm text-zinc-600">{t(errorKey)}</p>
            </div>
          )}

          {!loading && !hasError && drafts.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-400">
              {t("ai.state.empty")}
            </p>
          )}

          {!loading &&
            drafts.map((draft, i) => (
              <DraftItem
                key={i}
                text={draft}
                copyLabel={t("ai.action.copy")}
                onCopy={() => {
                  copyToClipboard(draft);
                  markAiAccepted(result?.aiEventId, {
                    feature: "intro_message_draft",
                    via: "copy",
                  });
                }}
              />
            ))}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-100 px-5 py-3.5 flex items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-400 leading-tight max-w-[240px]">
            AI 생성 초안 · 전송 전 내용을 꼭 확인해 주세요.
          </p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 transition-colors disabled:opacity-40"
          >
            <RefreshIcon />
            {t("ai.action.refresh")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline variant (used in MatchmakerCard with autoOpen) ───────────────────

function InlineDraftView({
  loading,
  result,
  onRefresh,
}: {
  loading: boolean;
  result: IntroMessageDraftResult | null;
  onRefresh: () => void;
}) {
  const { t } = useT();

  const drafts = result?.drafts ?? [];
  const isDegraded = Boolean(result?.degraded);

  const errorKey =
    isDegraded && result?.reason
      ? result.reason === "cap"
        ? "ai.error.softCap"
        : result.reason === "no_key"
          ? "ai.error.unavailable"
          : result.reason === "invalid_input"
            ? "ai.error.invalidInput"
            : "ai.error.tryLater"
      : null;

  return (
    <div className="mt-3 rounded-2xl border border-zinc-200 bg-white overflow-hidden">
      {/* Mini header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-zinc-100 bg-zinc-50/60">
        <SparkleIcon className="text-zinc-500" />
        <p className="text-xs font-medium text-zinc-600">{t("ai.intro.panel.title")}</p>
      </div>

      <div className="p-3 space-y-2">
        {loading && (
          <>
            <DraftSkeleton />
            <DraftSkeleton />
          </>
        )}

        {!loading && errorKey && (
          <p className="py-3 text-center text-xs text-zinc-500">{t(errorKey)}</p>
        )}

        {!loading &&
          !errorKey &&
          drafts.map((draft, i) => (
            <DraftItem
              key={i}
              text={draft}
              copyLabel={t("ai.action.copy")}
              onCopy={() => {
                copyToClipboard(draft);
                markAiAccepted(result?.aiEventId, {
                  feature: "intro_message_draft",
                  via: "copy",
                });
              }}
            />
          ))}
      </div>

      <div className="px-3 pb-3 flex justify-end">
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:border-zinc-300 transition-colors disabled:opacity-40"
        >
          <RefreshIcon />
          {t("ai.action.refresh")}
        </button>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function IntroMessageAssist({
  me,
  recipient,
  variant = "button",
  autoOpen = false,
}: Props) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(autoOpen);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntroMessageDraftResult | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const trigger = useCallback(async () => {
    setLoading(true);
    setResult(null);
    const res = await aiApi.introMessageDraft({ intro: { me, recipient, locale } });
    setResult(res);
    setLoading(false);
  }, [me, recipient, locale]);

  // Auto-trigger for inline variant
  useEffect(() => {
    if (autoOpen) {
      void trigger();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setResult(null);
  }, []);

  // ── Inline variant (MatchmakerCard) ──────────────────────────────────────
  if (variant === "inline") {
    return (
      <InlineDraftView loading={loading} result={result} onRefresh={trigger} />
    );
  }

  // ── Button variant (PeopleClient) ────────────────────────────────────────
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (open) {
            close();
            return;
          }
          setOpen(true);
          void trigger();
        }}
        className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 transition-colors"
        title={t("ai.disclosure.tooltip")}
      >
        <SparkleIcon className="text-zinc-400" />
        {t("ai.intro.draftCta")}
      </button>

      {open && mounted &&
        createPortal(
          <IntroSheet
            loading={loading}
            result={result}
            recipientName={
              typeof (recipient as { display_name?: string | null }).display_name === "string"
                ? (recipient as { display_name?: string | null }).display_name
                : null
            }
            onRefresh={trigger}
            onClose={close}
          />,
          document.body,
        )}
    </>
  );
}
