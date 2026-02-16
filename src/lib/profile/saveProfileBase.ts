/**
 * Single entry point for main profile base save. Uses update_my_profile_base RPC only (no PATCH).
 * Never sends username (main profile save must not overwrite username with null).
 */

import { supabase } from "@/lib/supabase/client";
import { getMyProfile } from "@/lib/supabase/profiles";

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

/** Remove null, undefined, and "" so RPC never receives username=null / empty. */
function compactPatch(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    out[key] = value;
  }
  return out;
}

function whitelist(patch: Record<string, unknown>): Record<string, unknown> {
  const compact = compactPatch(patch);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(compact)) {
    if (BASE_PATCH_WHITELIST.has(key)) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Saves main profile base via update_my_profile_base RPC. Ensures session, then re-fetches profile.
 */
export async function saveMyProfileBaseRpc(payload: {
  patch: Record<string, unknown>;
  completeness?: number | null;
}): Promise<{ data: Awaited<ReturnType<typeof getMyProfile>>["data"]; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return { data: null, error: new Error("Not authenticated") };
  }

  const p_patch = whitelist(payload.patch);
  const p_completeness = payload.completeness ?? null;

  const { data: rpcData, error: rpcError } = await supabase.rpc("update_my_profile_base", {
    p_patch,
    p_completeness: p_completeness,
  });

  if (rpcError) {
    console.error("saveMyProfileBaseRpc failed", {
      message: rpcError.message,
      code: (rpcError as { code?: string }).code,
      details: (rpcError as { details?: string }).details,
      hint: (rpcError as { hint?: string }).hint,
    });
    return { data: null, error: rpcError };
  }

  if (rpcData == null && Object.keys(p_patch).length > 0) {
    console.warn("update_my_profile_base returned no row");
  }

  const { data: profile, error: fetchError } = await getMyProfile();
  return { data: profile, error: fetchError ?? null };
}
