/**
 * Central entitlement resolver.
 *
 * Every feature gate in the app should pass through `resolveEntitlementFor`
 * so gating logic stays on one path. The resolver:
 *
 *   1. Fetches the caller's `entitlements` row (default `free` when missing).
 *   2. Folds in acting-as / workspace plans when the feature namespace
 *      billable-subject is the principal (vs the delegate).
 *   3. Checks the plan matrix for allow.
 *   4. If allowed and a quota rule exists, fetches rolling usage and
 *      marks `near_limit` / `quota_exceeded` as appropriate.
 *   5. Applies `BETA_ALL_PAID` override at the end so usage still gets
 *      measured in the shadow path.
 *
 * The decision is returned verbatim to callers; it is their responsibility
 * to render/paywall/meter accordingly. The resolver itself never emits UI.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/lib/supabase/client";
import {
  featureKeyNamespace,
  resolveFeatureKey,
  type FeatureKey,
} from "./featureKeys";
import { PLAN_FEATURE_MATRIX, recommendPaywallPlan } from "./planMatrix";
import {
  computeQuotaInfo,
  fetchUsageForFeature,
  getQuotaRuleFor,
} from "./quotaHelpers";
import { applyBetaOverride } from "./betaOverrides";
import type {
  EntitlementDecision,
  EntitlementSource,
  PlanKey,
  ResolverContext,
  UiState,
} from "./types";

type CachedPlan = { plan: PlanKey; status: string; valid_until: string | null };

const CACHE_TTL_MS = 30_000;
const planCache = new Map<string, { at: number; value: CachedPlan }>();

async function fetchPlanFor(
  userId: string,
  client: SupabaseClient
): Promise<CachedPlan> {
  const cached = planCache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const { data, error } = await client
    .from("entitlements")
    .select("plan, status, valid_until")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && process.env.NODE_ENV !== "production") {
    console.warn("[entitlements/resolve] fetchPlanFor failed", error.message);
  }

  const row = data as { plan?: string; status?: string; valid_until?: string | null } | null;
  const plan = (row?.plan as PlanKey | undefined) ?? "free";
  const status = row?.status ?? "free";
  const valid_until = row?.valid_until ?? null;

  const value: CachedPlan = { plan, status, valid_until };
  planCache.set(userId, { at: Date.now(), value });
  return value;
}

export function invalidatePlanCache(userId?: string | null): void {
  if (userId) planCache.delete(userId);
  else planCache.clear();
}

/**
 * Billing subject for a feature. Delegation/workspace features always bill
 * the acting user (capability lives with the delegate). All other features
 * bill the principal being acted upon (we don't want a delegate's free
 * quota to throttle a paid artist's uploads).
 */
function resolveBillingActor(
  featureKey: FeatureKey,
  ctx: ResolverContext
): string | null {
  const ns = featureKeyNamespace(featureKey);
  if (ns === "delegation" || ns === "workspace") {
    return ctx.userId;
  }
  return ctx.actingAsOwnerUserId ?? ctx.userId;
}

async function fetchWorkspacePlan(
  workspaceId: string,
  client: SupabaseClient
): Promise<PlanKey | null> {
  try {
    const { data, error } = await client
      .from("workspaces")
      .select("plan_key, status")
      .eq("id", workspaceId)
      .maybeSingle();
    if (error || !data) return null;
    const plan = (data as { plan_key?: string }).plan_key as PlanKey | undefined;
    return plan ?? null;
  } catch {
    return null;
  }
}

function mergeBundle(...plans: Array<PlanKey | null | undefined>): PlanKey[] {
  const set = new Set<PlanKey>();
  for (const p of plans) if (p) set.add(p);
  if (set.has("artist_pro") && set.has("discovery_pro")) {
    set.add("hybrid_pro");
  }
  return Array.from(set);
}

export type ResolveOptions = {
  featureKey: FeatureKey | string;
  userId: string | null;
  actingAsOwnerUserId?: string | null;
  workspaceId?: string | null;
  client?: SupabaseClient;
  /** When true, suppress DB quota lookup — used by UI call sites that only
   *  need a rendering decision. */
  skipQuotaCheck?: boolean;
};

export async function resolveEntitlementFor(
  opts: ResolveOptions
): Promise<EntitlementDecision> {
  const client = opts.client ?? defaultClient;
  const featureKey = resolveFeatureKey(opts.featureKey);
  if (!featureKey) {
    return blockedDecision(opts.featureKey, "missing_plan");
  }

  const billingActor = resolveBillingActor(featureKey, {
    userId: opts.userId ?? null,
    actingAsOwnerUserId: opts.actingAsOwnerUserId ?? null,
    workspaceId: opts.workspaceId ?? null,
  });

  if (!billingActor) {
    const baseFree = baselineDecision(featureKey, "free", ["free"], null);
    return applyBetaOverride(baseFree);
  }

  const actorPlan = await fetchPlanFor(billingActor, client);
  const bundle: PlanKey[] = [actorPlan.plan];

  if (opts.actingAsOwnerUserId && opts.actingAsOwnerUserId !== opts.userId) {
    const ns = featureKeyNamespace(featureKey);
    if (ns === "delegation" || ns === "workspace") {
      // Already billing the delegate — nothing to add.
    } else if (opts.userId) {
      const delegatePlan = await fetchPlanFor(opts.userId, client);
      bundle.push(delegatePlan.plan);
    }
  }

  if (opts.workspaceId) {
    const wsPlan = await fetchWorkspacePlan(opts.workspaceId, client);
    if (wsPlan) bundle.push(wsPlan);
  }

  const effectiveBundle = mergeBundle(...bundle);
  const allowedPlans = PLAN_FEATURE_MATRIX[featureKey] ?? [];
  const matched = effectiveBundle.find((p) => allowedPlans.includes(p)) ?? null;

  let decision: EntitlementDecision;
  if (matched) {
    const rule = getQuotaRuleFor(featureKey, matched);
    let quota = null as EntitlementDecision["quota"];
    let uiState: UiState = "available";
    let source: EntitlementSource = "plan";
    if (rule && !opts.skipQuotaCheck) {
      const summary = await fetchUsageForFeature(billingActor, rule, client);
      quota = computeQuotaInfo(rule, summary);
      if (quota && quota.limit !== Number.POSITIVE_INFINITY) {
        if (quota.remaining <= 0) {
          source = "quota_exceeded";
          uiState = "blocked";
        } else if (quota.remaining <= Math.max(3, Math.floor(quota.limit * 0.1))) {
          uiState = "near_limit";
        }
      }
    }
    decision = {
      allowed: source !== "quota_exceeded",
      source,
      featureKey,
      planKey: matched,
      effectiveBundle,
      quota,
      paywallHint: source === "quota_exceeded" ? recommendPaywallPlan(featureKey) : null,
      uiState,
    };
  } else {
    decision = {
      allowed: false,
      source: actorPlan.plan === "free" ? "missing_plan" : "plan",
      featureKey,
      planKey: actorPlan.plan,
      effectiveBundle,
      quota: null,
      paywallHint: recommendPaywallPlan(featureKey),
      uiState: "soft_locked",
    };
  }

  return applyBetaOverride(decision);
}

function baselineDecision(
  featureKey: FeatureKey,
  planKey: PlanKey,
  effectiveBundle: PlanKey[],
  quota: EntitlementDecision["quota"]
): EntitlementDecision {
  const allowed = (PLAN_FEATURE_MATRIX[featureKey] ?? []).includes(planKey);
  return {
    allowed,
    source: allowed ? "plan" : "missing_plan",
    featureKey,
    planKey,
    effectiveBundle,
    quota,
    paywallHint: allowed ? null : recommendPaywallPlan(featureKey),
    uiState: allowed ? "available" : "soft_locked",
  };
}

function blockedDecision(
  featureKey: string,
  source: EntitlementSource
): EntitlementDecision {
  return {
    allowed: false,
    source,
    featureKey,
    planKey: "free",
    effectiveBundle: ["free"],
    quota: null,
    paywallHint: null,
    uiState: "blocked",
  };
}

/** Synchronous sibling used when a cached plan is already known — avoids
 *  the DB round trip for hot rendering paths. Quota is not evaluated. */
export function resolveEntitlementSync(
  featureKey: FeatureKey | string,
  planKey: PlanKey
): EntitlementDecision {
  const resolved = resolveFeatureKey(featureKey);
  if (!resolved) return blockedDecision(featureKey, "missing_plan");
  const decision = baselineDecision(resolved, planKey, [planKey], null);
  return applyBetaOverride(decision);
}
