/**
 * Entitlements (plan gating) for paid features.
 * No payments yet: plan = free | artist_pro | collector_pro.
 * Missing row => plan = 'free'.
 */

import { supabase } from "@/lib/supabase/client";

export type Plan = "free" | "artist_pro" | "collector_pro";
export type Entitlement = {
  plan: Plan;
  status: string;
  valid_until: string | null;
};

const FEATURE_PLANS: Record<string, Plan[]> = {
  VIEW_PROFILE_VIEWERS_LIST: ["artist_pro", "collector_pro"],
  VIEW_ARTWORK_VIEWERS_LIST: ["artist_pro", "collector_pro"],
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
