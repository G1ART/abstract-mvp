/**
 * Type primitives for the monetization spine.
 *
 * The resolver contract stays intentionally explicit: every call produces an
 * `EntitlementDecision` that records **why** a feature is allowed or blocked
 * so downstream UI can render the right copy and analytics can reconstruct
 * the gate in offline reports.
 */

export type PlanKey =
  | "free"
  | "artist_pro"
  | "discovery_pro"
  | "hybrid_pro"
  | "gallery_workspace";

export type SubscriptionStatus =
  | "free"
  | "active"
  | "past_due"
  | "canceled"
  | "grace"
  | "beta_all_paid";

export type EntitlementSource =
  | "plan"
  | "beta_override"
  | "quota_exceeded"
  | "missing_plan"
  | "workspace"
  | "delegation";

export type UiState =
  | "available"
  | "soft_locked"
  | "beta_granted"
  | "near_limit"
  | "blocked";

export type PaywallHint =
  | "artist_pro"
  | "discovery_pro"
  | "hybrid_pro"
  | "gallery_workspace"
  | null;

export type QuotaInfo = {
  limit: number;
  used: number;
  remaining: number;
  windowDays: number;
};

export type EntitlementDecision = {
  allowed: boolean;
  source: EntitlementSource;
  featureKey: string;
  planKey: PlanKey;
  /**
   * Union of plans that were folded into the final decision. For a baseline
   * free user this is `["free"]`. When `actingAsProfileId`/`workspaceId` is
   * provided, the delegator/workspace plan may be folded in.
   */
  effectiveBundle: PlanKey[];
  quota: QuotaInfo | null;
  paywallHint: PaywallHint;
  uiState: UiState;
};

/**
 * Legacy (pre-spine) entitlement shape, preserved so callers that imported
 * `Plan` / `Entitlement` from `@/lib/entitlements` keep compiling during
 * the soft-migration window. The plan literal is intentionally widened so
 * downstream `ensureFreeEntitlement` accepts every new plan key.
 */
export type Plan = PlanKey;
export type Entitlement = {
  plan: Plan;
  status: SubscriptionStatus | string;
  valid_until: string | null;
};

export type ResolverContext = {
  userId: string | null;
  actingAsOwnerUserId?: string | null;
  workspaceId?: string | null;
};
