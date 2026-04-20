/**
 * Canonical placeholder-username rule (Onboarding Identity Overhaul).
 *
 * Kept in lockstep with the DB helper `public.is_placeholder_username`
 * in `supabase/migrations/20260421120000_identity_completeness.sql`.
 * Server decisions (e.g. `get_my_auth_state.is_placeholder_username`)
 * are authoritative; this helper is the fallback when server flags
 * are absent (e.g. a component that only has a profile row handy).
 *
 * Matches every generator format observed so far:
 *   - `ensure_profile_row`:            user_<8 hex>
 *   - `profiles_username_autogen`:     user_<12 hex>
 *   - future variants:                 user_<6–16 hex>
 */

const PLACEHOLDER_USERNAME_REGEX = /^user_[a-f0-9]{6,16}$/i;

export function isPlaceholderUsername(
  username: string | null | undefined
): boolean {
  if (!username) return false;
  return PLACEHOLDER_USERNAME_REGEX.test(username.trim().toLowerCase());
}

/**
 * Prefer server-reported `is_placeholder_username` when available.
 * Useful for components that already hold an `AuthState` tuple.
 */
export function resolveIsPlaceholder(
  serverFlag: boolean | null | undefined,
  fallbackUsername: string | null | undefined
): boolean {
  if (typeof serverFlag === "boolean") return serverFlag;
  return isPlaceholderUsername(fallbackUsername);
}
