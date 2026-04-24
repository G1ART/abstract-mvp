import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseForBearer(token: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function requireUserFromRequest(req: Request): Promise<
  | { ok: true; userId: string; token: string; supabase: SupabaseClient }
  | { ok: false; response: Response }
> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!token) {
    return { ok: false, response: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }) };
  }
  const supabase = createSupabaseForBearer(token);
  if (!supabase) {
    return { ok: false, response: new Response(JSON.stringify({ error: "misconfigured" }), { status: 500 }) };
  }
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, response: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }) };
  }
  return { ok: true, userId: user.id, token, supabase };
}
