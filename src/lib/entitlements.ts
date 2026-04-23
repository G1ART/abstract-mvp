/**
 * Entitlements (plan gating) for paid features.
 * No payments yet: plan = free | artist_pro | collector_pro.
 * Missing row => plan = 'free'.
 *
 * BETA_ALL_PAID:
 *   While we're in closed beta, every onboarded user is implicitly treated
 *   as a paid subscriber so that product flows exercise the full feature
 *   surface. Flip this to `false` the moment paid tiers go live so the
 *   real plan table starts gating features.
 */

import { supabase } from "@/lib/supabase/client";

export type Plan = "free" | "artist_pro" | "collector_pro";
export type Entitlement = {
  plan: Plan;
  status: string;
  valid_until: string | null;
};

export const BETA_ALL_PAID = true;

/**
 * Feature matrix — declares which plans unlock which capability. Keep this
 * alphabetically ordered and in sync with any new gated feature. The
 * monetization roadmap uses this map as the single source of truth.
 */
const FEATURE_PLANS: Record<string, Plan[]> = {
  // Analytics (existing)
  VIEW_PROFILE_VIEWERS_LIST: ["artist_pro", "collector_pro"],
  VIEW_ARTWORK_VIEWERS_LIST: ["artist_pro", "collector_pro"],
  // Artist-side "who saved my work" visibility. Free users see an
  // anonymized nudge; paid users see actor identity + board title.
  SEE_BOARD_SAVER_IDENTITY: ["artist_pro"],
  SEE_BOARD_PUBLIC_ACTOR_DETAILS: ["artist_pro"],
};

let cached: { plan: Plan; status: string; valid_until: string | null } | null = null;

export async function getMyEntitlements(): Promise<Entitlement> {
  if (cached) return cached;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return { plan: "free", status: "active", valid_until: null };
  }

  const { data } = await supabase
    .from("entitlements")
    .select("plan, status, valid_until")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const row = data as { plan?: string; status?: string; valid_until?: string | null } | null;
  const plan = (row?.plan as Plan) ?? "free";
  const status = row?.status ?? "active";
  const valid_until = row?.valid_until ?? null;

  cached = { plan, status, valid_until };
  setTimeout(() => { cached = null; }, 30_000);
  return cached;
}

export function hasFeature(plan: Plan, feature: string): boolean {
  // Beta override: unlock every declared gated feature for all onboarded
  // users. When paid tiers ship, set BETA_ALL_PAID = false to let the real
  // matrix take effect.
  if (BETA_ALL_PAID) return true;
  const allowed = FEATURE_PLANS[feature];
  if (!allowed) return false;
  return allowed.includes(plan);
}

export async function ensureFreeEntitlement(userId: string): Promise<void> {
  await supabase.from("entitlements").upsert(
    { user_id: userId, plan: "free", status: "active", updated_at: new Date().toISOString() },
    { onConflict: "user_id", ignoreDuplicates: false }
  );
}
