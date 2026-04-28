"use client";

/**
 * Beta feedback capture helpers.
 *
 * Two surfaces share this module:
 *   - `BetaFeedbackPrompt`  — page-level "useful / confusing / issue" pill
 *   - `AiFeedbackChips`     — micro-feedback under AI outputs (e.g. Pitch Pack)
 *
 * The submit path is non-throwing and best-effort. RLS only allows users
 * to insert rows for themselves; failures are silently swallowed so that
 * regression in feedback storage never blocks core flows.
 *
 * Throttling lives in sessionStorage so we don't nag users mid-session,
 * yet stays loose enough to honor a returning visit.
 */

import { supabase } from "@/lib/supabase/client";
import { logBetaEventSync } from "./logEvent";

export type BetaFeedbackSentiment =
  | "useful"
  | "confusing"
  | "blocked"
  | "issue"
  | "not_now";

export type BetaFeedbackInput = {
  pageKey: string;
  sentiment: BetaFeedbackSentiment;
  contextType?: string | null;
  contextId?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
};

const FEEDBACK_THROTTLE_KEY_PREFIX = "abstract.feedback.shown.";
const FEEDBACK_DISMISS_KEY_PREFIX = "abstract.feedback.dismissed.";
const FEEDBACK_SUBMITTED_KEY_PREFIX = "abstract.feedback.submitted.";

/**
 * Submit one feedback event. Best-effort. Returns true on success so the
 * caller can show a calm acknowledgement; never throws.
 */
export async function submitBetaFeedback(input: BetaFeedbackInput): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id ?? null;
    const { error } = await supabase.from("beta_feedback_events").insert({
      user_id: uid,
      profile_id: uid,
      page_key: input.pageKey,
      context_type: input.contextType ?? null,
      context_id: input.contextId ?? null,
      sentiment: input.sentiment,
      message: input.message ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) return false;
    // Mirror to the analytics pipeline so dashboards see a single feed.
    logBetaEventSync("tour_completed", {
      kind: "beta_feedback_submitted",
      page_key: input.pageKey,
      sentiment: input.sentiment,
      context_type: input.contextType ?? null,
    });
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(
          `${FEEDBACK_SUBMITTED_KEY_PREFIX}${input.pageKey}`,
          "1",
        );
      } catch {
        /* ignore */
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true if a page-level prompt for `pageKey` has already been
 * shown, dismissed, or submitted in this session. Caller can use this to
 * skip rendering on subsequent visits within the same tab.
 */
export function isFeedbackThrottled(pageKey: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const ss = window.sessionStorage;
    return Boolean(
      ss.getItem(`${FEEDBACK_THROTTLE_KEY_PREFIX}${pageKey}`) ||
        ss.getItem(`${FEEDBACK_DISMISS_KEY_PREFIX}${pageKey}`) ||
        ss.getItem(`${FEEDBACK_SUBMITTED_KEY_PREFIX}${pageKey}`) ||
        // Global cap: at most ONE page-level prompt per session.
        ss.getItem("abstract.feedback.session.shown"),
    );
  } catch {
    return true;
  }
}

/** Mark the current page's prompt as visible (counts toward session cap). */
export function markFeedbackShown(pageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    const ss = window.sessionStorage;
    ss.setItem(`${FEEDBACK_THROTTLE_KEY_PREFIX}${pageKey}`, "1");
    ss.setItem("abstract.feedback.session.shown", "1");
  } catch {
    /* ignore */
  }
}

/** Mark a prompt as dismissed for the rest of the session. */
export function markFeedbackDismissed(pageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${FEEDBACK_DISMISS_KEY_PREFIX}${pageKey}`,
      "1",
    );
  } catch {
    /* ignore */
  }
}
