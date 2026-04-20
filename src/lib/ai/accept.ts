"use client";

import type { AiFeatureKey } from "./types";
import { acceptAiEvent } from "./browser";
import { logBetaEventSync } from "@/lib/beta/logEvent";

/**
 * Centralized helper for marking an AI suggestion as "accepted".
 *
 * Wave 2 canonicalizes acceptance telemetry here so every AI surface —
 * profile copilot, portfolio copilot, bio draft, exhibition draft,
 * inquiry reply, intro message, matchmaker, weekly digest — walks
 * through the same two steps:
 *
 *   1. Flip `ai_events.accepted = true` via `/api/ai/accept` (the
 *      `acceptAiEvent` helper in `./browser.ts`). This is the source of
 *      truth for the telemetry view (`v_ai_events_summary`).
 *   2. Emit a `ai_accepted` beta analytics event with `{ feature, via }`
 *      so we can slice acceptance by surface (`apply`, `copy`, `send`,
 *      `link`) on the dashboard side.
 *
 * The helper intentionally accepts `null | undefined` for `aiEventId` so
 * callers never have to guard — if there was no AI event (user typed
 * their own text and hit send), the call is a noop. Telemetry failures
 * never block UX.
 */
export type AiAcceptVia = "apply" | "copy" | "send" | "link";

export function markAiAccepted(
  aiEventId: string | null | undefined,
  opts: { feature: AiFeatureKey; via: AiAcceptVia },
): void {
  if (!aiEventId) return;
  void acceptAiEvent(aiEventId);
  logBetaEventSync("ai_accepted", {
    ai_event_id: aiEventId,
    feature: opts.feature,
    via: opts.via,
  });
}
