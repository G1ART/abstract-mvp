/**
 * Beta override switch.
 *
 * During closed beta every onboarded user is treated as having `hybrid_pro`
 * access so product flows exercise the entire monetized surface. Flip the
 * constant to `false` (or drive it from an env var in a follow-up patch)
 * when paid tiers go live; the resolver will then read actual plan values
 * from the `entitlements` table.
 *
 * Crucially, `applyBetaOverride` only flips `allowed` — it does **not**
 * suppress quota computation. Usage events continue to land in
 * `usage_events` so we retain a faithful baseline for post-beta pricing.
 */

import type { EntitlementDecision, UiState } from "./types";

export const BETA_ALL_PAID = true;

export function applyBetaOverride(
  decision: EntitlementDecision
): EntitlementDecision {
  if (!BETA_ALL_PAID) return decision;
  const uiState: UiState = decision.quota && decision.quota.limit > 0 && decision.quota.remaining <= 3
    ? "near_limit"
    : "beta_granted";
  return {
    ...decision,
    allowed: true,
    source: "beta_override",
    uiState,
  };
}
