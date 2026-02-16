import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns the current session user id. Prefer getUser() for fresh identity after login/logout.
 * @throws Error("Not authenticated") when no user
 */
export async function requireSessionUid(supabase: SupabaseClient): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.id) {
    throw new Error("Not authenticated");
  }
  return user.id;
}
