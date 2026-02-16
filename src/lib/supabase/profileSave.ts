/**
 * Profile save via RPC (auth.uid() 기반).
 * Single path: upsert_my_profile. Legacy update_my_profile_base / update_my_profile_details are not used (PostgREST 42702/42804).
 */

import { supabase } from "./client";

export type ProfileSaveRpcResult = {
  id: string;
  username: string | null;
  profile_completeness: number | null;
  profile_details: Record<string, unknown> | null;
};

export type SaveMyProfileUpsertArgs = {
  basePatch: Record<string, unknown>;
  detailsPatch: Record<string, unknown>;
  completeness: number | null;
};

/**
 * Single RPC to upsert base + details. Returns row or throws.
 */
export async function saveMyProfileUpsertRpc(
  args: SaveMyProfileUpsertArgs
): Promise<ProfileSaveRpcResult> {
  const { data, error } = await supabase.rpc("upsert_my_profile", {
    p_base: args.basePatch,
    p_details: args.detailsPatch,
    p_completeness: args.completeness,
  });
  if (error) throw error;
  const row = Array.isArray(data) && data[0] ? (data[0] as ProfileSaveRpcResult) : null;
  if (!row) throw new Error("RPC returned no rows");
  return row;
}
