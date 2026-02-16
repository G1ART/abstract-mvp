/**
 * Profile save via RPC (auth.uid() 기반).
 * Base and details both use DB RPC; no frontend .from('profiles').update().
 * P0: Single RPC + verify-after-error for truthful save outcome.
 */

import { supabase } from "./client";
import { getMyProfile } from "./profiles";

export type ProfileSaveRpcResult = {
  id: string;
  username: string | null;
  profile_completeness: number | null;
  profile_details: Record<string, unknown> | null;
  display_name?: string | null;
  bio?: string | null;
  [k: string]: unknown;
};

function patchApplied(
  basePatch: Record<string, unknown>,
  detailsPatch: Record<string, unknown>,
  profile: Record<string, unknown> | null
): boolean {
  if (!profile) return false;
  for (const [k, v] of Object.entries(basePatch)) {
    const dbVal = profile[k];
    if (k === "roles" && Array.isArray(v) && Array.isArray(dbVal)) {
      if (v.length !== dbVal.length || v.some((x, i) => dbVal[i] !== x)) return false;
    } else if (JSON.stringify(dbVal) !== JSON.stringify(v)) return false;
  }
  if (Object.keys(detailsPatch).length === 0) return true;
  const pd = profile.profile_details as Record<string, unknown> | null | undefined;
  for (const [k, v] of Object.entries(detailsPatch)) {
    if (JSON.stringify(pd?.[k]) !== JSON.stringify(v)) return false;
  }
  return true;
}

function rowFromJsonb(j: unknown): ProfileSaveRpcResult | null {
  if (!j || typeof j !== "object") return null;
  const r = j as Record<string, unknown>;
  return {
    id: String(r?.id ?? ""),
    username: r?.username != null ? String(r.username) : null,
    profile_completeness: r?.profile_completeness != null ? Number(r.profile_completeness) : null,
    profile_details: (r?.profile_details as Record<string, unknown>) ?? null,
  };
}

/**
 * Single RPC: base + details + completeness in one transaction.
 * On error/timeout: verify from DB; if patch applied, treat as success.
 */
export async function saveMyProfileOneRpc(
  basePatch: Record<string, unknown>,
  detailsPatch: Record<string, unknown>,
  completeness?: number | null
): Promise<{ data: ProfileSaveRpcResult | null; error: unknown; skipped?: boolean }> {
  const hasBase = Object.keys(basePatch).length > 0;
  const hasDetails = Object.keys(detailsPatch).length > 0;
  if (!hasBase && !hasDetails) return { data: null, error: null, skipped: true };

  const pBase = hasBase ? basePatch : {};
  const pDetails = hasDetails ? detailsPatch : {};
  const pCompleteness = completeness ?? null;

  const { data, error } = await supabase.rpc("upsert_my_profile", {
    p_base: pBase,
    p_details: pDetails,
    p_completeness: pCompleteness,
  });

  if (!error && data) {
    const row = rowFromJsonb(data);
    if (row) return { data: row, error: null };
  }

  const { data: fresh } = await getMyProfile();
  const profile = fresh as Record<string, unknown> | null;
  if (patchApplied(basePatch, detailsPatch, profile)) {
    const row: ProfileSaveRpcResult = {
      id: String(profile?.id ?? ""),
      username: profile?.username != null ? String(profile.username) : null,
      profile_completeness: profile?.profile_completeness != null ? Number(profile.profile_completeness) : null,
      profile_details: (profile?.profile_details as Record<string, unknown>) ?? null,
    };
    return { data: row, error: null };
  }

  return { data: null, error: error ?? new Error("RPC failed"), skipped: false };
}

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
