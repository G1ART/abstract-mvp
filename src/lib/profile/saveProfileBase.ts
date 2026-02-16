/**
 * Single entry point for main profile base save. Uses update_my_profile_base RPC only (no PATCH).
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

function whitelist(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (BASE_PATCH_WHITELIST.has(key) && value !== undefined) {
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
