import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensures the client has a valid session (auth-bearing). Use before RPCs that rely on auth.uid().
 * Prefer getSession first, then getUser as fallback.
 * @throws Error("not_authenticated") when no session or user id
 */
export async function requireSession(
  supabase: SupabaseClient
): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user?.id) return data.session.user.id;
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user?.id) return userData.user.id;
  throw new Error("not_authenticated");
}

/**
 * Alias that uses getUser() as primary (some clients differ). Prefer requireSession.
 */
export async function requireUser(
  supabase: SupabaseClient
): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (data.user?.id) return data.user.id;
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user?.id) return sessionData.session.user.id;
  throw new Error("not_authenticated");
}
