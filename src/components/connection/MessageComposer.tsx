"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/useT";
import {
  sendConnectionMessage,
} from "@/lib/supabase/connectionMessages";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

export type MessageComposerProps = {
  recipientId: string;
  /** Friendly recipient name surfaced in the placeholder. */
  recipientLabel?: string | null;
  /**
   * Fires after a successful send. Callers can use this to append the new
   * message optimistically to a thread view, clear a sheet, etc.
   */
  onSent?: (payload: { messageId: string; body: string }) => void;
  /** Visual variant — inline keeps the composer flush inside a thread; sheet
   *  wraps it in its own card. */
  variant?: "inline" | "card";
  /** Auto-focus the textarea when mounted. Defaults to false so drive-by
   *  renders on dense pages don't grab focus unexpectedly. */
  autoFocus?: boolean;
};

const MAX_BODY = 4000;

/**
 * Unified composer for `connection_messages`. Handles the full round-trip:
 *   • textarea with soft character count
 *   • `social.connection_unlimited` entitlement readout (quota hint / soft
 *     block when exhausted)
 *   • send → server insert → onSent callback
 *
 * This component is intentionally UI-only for the "free write" flow — the
 * AI-assisted draft path lives in `IntroMessageAssist` and is unchanged.
 * Both ultimately call `sendConnectionMessage`, so the metering + RLS
 * semantics stay identical.
 */
export function MessageComposer({
  recipientId,
  recipientLabel,
  onSent,
  variant = "inline",
  autoFocus = false,
}: MessageComposerProps) {
  const { t } = useT();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Wire the composer to the existing entitlement spine. During beta
  // `BETA_ALL_PAID` forces allowed=true, but quota numbers keep flowing
  // so we can render an accurate "N sent this month" hint even now.
  const { decision, refresh } = useFeatureAccess(
    "social.connection_unlimited",
  );

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const quota = decision?.quota ?? null;
  const isUnlimited = !quota || quota.limit === Number.POSITIVE_INFINITY;
  const usageHint = useMemo(() => {
    if (!quota) return null;
    if (isUnlimited) {
      if (quota.used > 0) {
        return t("connection.composer.usageUnlimited").replace(
          "{used}",
          String(quota.used),
        );
      }
      return null;
    }
    return t("connection.composer.usageLimited")
      .replace("{used}", String(quota.used))
      .replace("{limit}", String(quota.limit));
  }, [quota, isUnlimited, t]);

  // `resolveEntitlementFor` marks `uiState: "near_limit"` when the
  // remaining allocation dips into the final 10%. Surfacing that here
  // primes users for the paywall without blocking them mid-compose.
  const isNearLimit = decision?.uiState === "near_limit";
  // With BETA_ALL_PAID the resolver rewrites `allowed` to true, so
  // "blocked" here only fires once we flip the flag off post-beta.
  const isBlocked = decision && !decision.allowed;

  const trimmed = body.trim();
  const canSend = !sending && trimmed.length > 0 && !isBlocked;

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    const { data, error: sendErr } = await sendConnectionMessage(
      recipientId,
      trimmed,
    );
    setSending(false);
    if (sendErr || !data) {
      setError(sendErr?.message ?? t("connection.sendError"));
      return;
    }
    setBody("");
    refresh();
    onSent?.({ messageId: data.id, body: trimmed });
  }, [canSend, recipientId, trimmed, onSent, refresh, t]);

  const wrapperClass =
    variant === "card"
      ? "rounded-xl border border-zinc-200 bg-white p-4"
      : "border-t border-zinc-200 bg-white p-3";

  return (
    <form
      className={wrapperClass}
      onSubmit={(e) => {
        e.preventDefault();
        void handleSend();
      }}
    >
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => {
          const next = e.target.value.slice(0, MAX_BODY);
          setBody(next);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          // Submit with ⌘/Ctrl + Enter so free-form line breaks still
          // work in the textarea itself. Matches the convention used by
          // the `/people` intro sheet.
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void handleSend();
          }
        }}
        disabled={!!isBlocked || sending}
        placeholder={
          recipientLabel
            ? t("connection.composer.placeholderTo").replace(
                "{name}",
                recipientLabel,
              )
            : t("connection.composer.placeholder")
        }
        rows={variant === "card" ? 4 : 3}
        className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none disabled:bg-zinc-50"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
        <div className="flex flex-wrap items-center gap-2">
          {usageHint && <span>{usageHint}</span>}
          {isNearLimit && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
              {t("connection.composer.nearLimit")}
            </span>
          )}
          {isBlocked && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">
              {t("connection.composer.blocked")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">
            {body.length}/{MAX_BODY}
          </span>
          <button
            type="submit"
            disabled={!canSend}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? t("common.loading") : t("connection.composer.send")}
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
