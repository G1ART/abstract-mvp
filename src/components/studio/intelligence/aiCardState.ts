"use client";

import type { AiDegradation } from "@/lib/ai/types";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * Map a degraded AI response to a single i18n message key. Kept
 * centrally so Wave 2 studio cards render the same language for each
 * reason (soft-cap, unavailable, invalid_input, and other failures).
 */
export function aiErrorKey(result: AiDegradation | null | undefined): MessageKey | null {
  const reason = result?.degraded ? result.reason : null;
  if (!reason) return null;
  if (reason === "cap") return "ai.error.softCap";
  if (reason === "no_key") return "ai.error.unavailable";
  if (reason === "invalid_input") return "ai.error.invalidInput";
  return "ai.error.tryLater";
}
