/**
 * Server-side entitlement helpers.
 *
 * Server routes (e.g. `handleAiRoute`) already have a per-request Supabase
 * client bound to the caller's JWT; they simply pass it in to
 * `resolveEntitlementFor`. This module re-exports the resolver for that
 * use case and adds a thin helper that accepts an already-validated user id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEntitlementFor, type ResolveOptions } from "./resolveEntitlement";
import type { EntitlementDecision } from "./types";

export async function resolveEntitlementForServer(
  client: SupabaseClient,
  userId: string,
  featureKey: string,
  extra?: Omit<ResolveOptions, "userId" | "featureKey" | "client">
): Promise<EntitlementDecision> {
  return resolveEntitlementFor({
    ...extra,
    userId,
    featureKey,
    client,
  });
}

export { resolveEntitlementFor };
export type { ResolveOptions };
