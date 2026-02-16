/**
 * Single SSOT for profile save. All writes go through upsert_my_profile RPC.
 * No direct PATCH/UPDATE/INSERT to profiles table from app.
 */

import { supabase } from "./client";

export type ProfileSaveUnifiedArgs = {
  basePatch: Record<string, unknown>;
  detailsPatch: Record<string, unknown>;
  completeness: number | null;
};

/** Whitelist for base: never send id, profile_details, profile_completeness, profile_updated_at. */
const BASE_KEYS = new Set([
  "display_name",
  "bio",
  "location",
  "website",
  "avatar_url",
  "is_public",
  "main_role",
  "roles",
  "education",
  "username",
]);

function toBasePatch(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (BASE_KEYS.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Save base + details + completeness in one RPC. Verifies session before call.
 */
export async function saveProfileUnified(args: ProfileSaveUnifiedArgs): Promise<Record<string, unknown>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }

  const p_base = toBasePatch(args.basePatch);
  const p_details = args.detailsPatch && typeof args.detailsPatch === "object" ? args.detailsPatch : {};
  const p_completeness = args.completeness ?? null;

  const { data, error } = await supabase.rpc("upsert_my_profile", {
    p_base: p_base,
    p_details: p_details,
    p_completeness: p_completeness,
  });

  if (error) {
    console.error("saveProfileUnified failed", {
      message: error.message,
      code: (error as { code?: string }).code,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
    });
    throw error;
  }

  if (data == null || typeof data !== "object") {
    throw new Error("RPC returned no data");
  }
  return data as Record<string, unknown>;
}
