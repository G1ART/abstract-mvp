/**
 * Profile save via RPC only (auth.uid()). No direct PATCH to profiles (prevents username NOT NULL 23502).
 * Main profile: update_my_profile_base with whitelist payload. Details: update_my_profile_details.
 */

import { supabase } from "./client";

export type ProfileSaveRpcResult = {
  id: string;
  username: string | null;
  profile_completeness: number | null;
  profile_details: Record<string, unknown> | null;
};

/** Keys allowed in base patch. Never send username, id, profile_details, profile_completeness. */
const BASE_PATCH_WHITELIST = new Set([
  "display_name",
  "bio",
  "location",
  "website",
  "avatar_url",
  "is_public",
  "main_role",
  "roles",
  "education",
]);

function whitelistBasePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (BASE_PATCH_WHITELIST.has(key) && value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Main profile save via update_my_profile_base RPC. Payload is whitelisted (no username/id/readonly).
 */
export async function saveProfileBaseRpc(
  basePatch: Record<string, unknown>,
  completeness: number | null
): Promise<ProfileSaveRpcResult> {
  const p_patch = whitelistBasePatch(basePatch);
  const { data, error } = await supabase.rpc("update_my_profile_base", {
    p_patch,
    p_completeness: completeness,
  });
  if (error) throw error;
  const row = Array.isArray(data) && data[0] ? (data[0] as ProfileSaveRpcResult) : null;
  if (!row) throw new Error("RPC returned no rows");
  return row;
}

/**
 * Details save via update_my_profile_details RPC.
 */
export async function saveProfileDetailsRpc(
  detailsPatch: Record<string, unknown>,
  completeness: number | null
): Promise<ProfileSaveRpcResult> {
  if (Object.keys(detailsPatch).length === 0) {
    throw new Error("details patch empty");
  }
  const { data, error } = await supabase.rpc("update_my_profile_details", {
    p_details: detailsPatch,
    p_completeness: completeness,
  });
  if (error) throw error;
  const row = Array.isArray(data) && data[0] ? (data[0] as ProfileSaveRpcResult) : null;
  if (!row) throw new Error("RPC returned no rows");
  return row;
}
