import { supabase } from "./client";

/** localStorage key: set to "true" after user sets password (set-password page or password login). */
export const HAS_PASSWORD_KEY = "has_password";

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

export async function sendMagicLink(email: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
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
