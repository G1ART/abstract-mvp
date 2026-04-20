import { isPlaceholderUsername } from "@/lib/identity/placeholder";

/**
 * @deprecated Use `isPlaceholderUsername` from `@/lib/identity/placeholder`
 * directly. Kept as an alias so pre-existing call-sites continue to work
 * while the Onboarding Identity Overhaul routes traffic through the
 * canonical helper (and matches the DB `is_placeholder_username`).
 */
export function isRandomUsername(username: string | null | undefined): boolean {
  return isPlaceholderUsername(username);
}

/** Legacy sessionStorage key used by the old `/username-fix` detour.
 *  New gate does not rely on sessionStorage (server decision is
 *  authoritative), but the key name stays around because older tabs
 *  may still have it set; `/username-fix` shim clears it on redirect. */
export const RANDOM_USERNAME_PROMPTED_KEY = "ab_random_username_prompted";
