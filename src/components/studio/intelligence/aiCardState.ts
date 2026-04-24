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
  switch (reason) {
    case "cap":
      return "ai.error.softCap";
    case "no_key":
      return "ai.error.unavailable";
    case "invalid_input":
      return invalidInputMessageKey(result?.validation);
    case "unauthorized":
      return "ai.error.unauthorized";
    case "parse":
      return "ai.error.parse";
    case "timeout":
      return "ai.error.timeout";
    case "error":
      return "ai.error.server";
    case "rate_limit":
      return "ai.error.rateLimit";
    case "context_limit":
      return "ai.error.contextLimit";
    case "upstream_auth":
      return "ai.error.upstreamAuth";
    default:
      return "ai.error.tryLater";
  }
}

function invalidInputMessageKey(validation: string | undefined): MessageKey {
  switch (validation) {
    case "missing_portfolio":
      return "ai.error.invalidInputPortfolio";
    case "missing_profile":
      return "ai.error.invalidInputProfile";
    case "missing_digest":
      return "ai.error.invalidInputDigest";
    default:
      return "ai.error.invalidInput";
  }
}
