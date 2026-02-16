/**
 * Profile save via RPC (auth.uid() 기반).
 * Base and details both use DB RPC; no frontend .from('profiles').update().
 */

import { supabase } from "./client";

export type ProfileSaveRpcResult = {
  id: string;
  username: string | null;
  profile_completeness: number | null;
  profile_details: Record<string, unknown> | null;
};

/** Base update via update_my_profile_base RPC. Patch is jsonb-ready. */
export async function saveProfileBaseRpc(
  basePatch: Record<string, unknown>,
  completeness?: number | null
): Promise<{ data: ProfileSaveRpcResult | null; error: unknown; skipped?: boolean }> {
  if (Object.keys(basePatch).length === 0) {
    return { data: null, error: null, skipped: true };
  }
  const { data, error } = await supabase.rpc("update_my_profile_base", {
    p_patch: basePatch,
    p_completeness: completeness ?? null,
  });
  if (error) return { data: null, error, skipped: false };
  const row = Array.isArray(data) && data[0] ? (data[0] as ProfileSaveRpcResult) : null;
  if (!row) {
    return { data: null, error: new Error("RPC returned no rows"), skipped: false };
  }
  return { data: row, error: null };
}

/** Details merge via update_my_profile_details RPC. */
export async function saveProfileDetailsRpc(
  detailsPatch: Record<string, unknown>,
  completeness?: number | null
): Promise<{ data: ProfileSaveRpcResult | null; error: unknown; skipped?: boolean }> {
  if (Object.keys(detailsPatch).length === 0) {
    return { data: null, error: null, skipped: true };
  }
  const { data, error } = await supabase.rpc("update_my_profile_details", {
    p_details: detailsPatch,
    p_completeness: completeness ?? null,
  });
  if (error) return { data: null, error, skipped: false };
  const row = Array.isArray(data) && data[0] ? (data[0] as ProfileSaveRpcResult) : null;
  if (!row) {
    return { data: null, error: new Error("RPC returned no rows"), skipped: false };
  }
  return { data: row, error: null };
}
