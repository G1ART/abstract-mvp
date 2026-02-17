import { supabase } from "./client";

/** localStorage key: set to "true" after user sets password (set-password page or password login). */
export const HAS_PASSWORD_KEY = "has_password";

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
