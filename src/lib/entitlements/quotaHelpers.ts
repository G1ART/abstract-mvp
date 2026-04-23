/**
 * Usage-event aggregation helpers used by the resolver to decide whether
 * a quota has been exhausted. All reads are scoped to `auth.uid()` via the
 * user-session client — RLS guarantees no cross-tenant leaks.
 *
 * Failure mode: every helper returns `0` on error so that resolver failures
 * never harden into false paywalls. We prefer to fail open during beta and
 * catch the anomaly in observability rather than block a user.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/lib/supabase/client";
import type { FeatureKey } from "./featureKeys";
import { PLAN_QUOTA_MATRIX, type QuotaRule } from "./planMatrix";
import type { PlanKey, QuotaInfo } from "./types";

export type UsageSummary = {
  used: number;
  windowDays: number;
  startedAt: string | null;
};

export function getQuotaRuleFor(
  featureKey: FeatureKey,
  planKey: PlanKey
): QuotaRule | null {
  const perFeature = PLAN_QUOTA_MATRIX[featureKey];
  if (!perFeature) return null;
  return perFeature[planKey] ?? null;
}

function startOfWindow(windowDays: number): Date | null {
  if (windowDays <= 0) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - windowDays);
  return d;
}

export async function fetchUsageForFeature(
  userId: string,
  rule: QuotaRule,
  client: SupabaseClient = defaultClient
): Promise<UsageSummary> {
  const since = startOfWindow(rule.windowDays);
  try {
    let q = client
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("event_key", rule.countEventKeys);
    if (since) q = q.gte("created_at", since.toISOString());
    const { count, error } = await q;
    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[entitlements/quotaHelpers] fetchUsageForFeature failed", error.message);
      }
      return { used: 0, windowDays: rule.windowDays, startedAt: since?.toISOString() ?? null };
    }
    return {
      used: count ?? 0,
      windowDays: rule.windowDays,
      startedAt: since?.toISOString() ?? null,
    };
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[entitlements/quotaHelpers] fetchUsageForFeature threw", err);
    }
    return { used: 0, windowDays: rule.windowDays, startedAt: since?.toISOString() ?? null };
  }
}

export function computeQuotaInfo(
  rule: QuotaRule,
  summary: UsageSummary
): QuotaInfo | null {
  if (rule.limit == null) {
    // Unlimited — expose the usage count anyway so UIs can render "12 used".
    return {
      limit: Number.POSITIVE_INFINITY,
      used: summary.used,
      remaining: Number.POSITIVE_INFINITY,
      windowDays: rule.windowDays,
    };
  }
  const remaining = Math.max(0, rule.limit - summary.used);
  return {
    limit: rule.limit,
    used: summary.used,
    remaining,
    windowDays: rule.windowDays,
  };
}
