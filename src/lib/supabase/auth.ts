import { supabase } from "./client";

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export type SignUpMetadata = {
  username?: string;
  display_name?: string;
  main_role?: string;
  roles?: string[];
};

export async function signUpWithPassword(
  email: string,
  password: string,
  metadata?: SignUpMetadata
) {
  return supabase.auth.signUp({
    email,
    password,
    options: metadata
      ? {
          data: {
            username: metadata.username?.trim().toLowerCase(),
            display_name: metadata.display_name?.trim() || null,
            main_role: metadata.main_role || null,
            roles: Array.isArray(metadata.roles) ? metadata.roles : null,
          },
        }
      : undefined,
  });
}

/** @param redirectTo - Optional path (or full URL) to redirect after auth (e.g. /invites/delegation?token=...) */
export async function sendMagicLink(email: string, redirectTo?: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  let url = `${origin}/auth/callback`;
  if (redirectTo && typeof redirectTo === "string" && redirectTo.startsWith("/")) {
    url += "?next=" + encodeURIComponent(redirectTo);
  }
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: url },
  });
}

export async function sendPasswordReset(email: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset`,
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  return supabase.auth.getSession();
}

/** Server-authoritative auth/onboarding state. Reads auth.users via SECURITY
 *  DEFINER RPC so the client cannot lie (unlike the old localStorage
 *  HAS_PASSWORD_KEY gate that used to be here).                                */
export type MyAuthState = {
  user_id: string;
  has_password: boolean;
  is_email_confirmed: boolean;
  needs_onboarding: boolean;
  username: string | null;
};

export async function getMyAuthState(): Promise<MyAuthState | null> {
  const { data, error } = await supabase.rpc("get_my_auth_state");
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (!r.user_id) return null;
  return {
    user_id: String(r.user_id),
    has_password: !!r.has_password,
    is_email_confirmed: !!r.is_email_confirmed,
    needs_onboarding: !!r.needs_onboarding,
    username: r.username == null ? null : String(r.username),
  };
}
