/**
 * Username suggestion engine (Onboarding Identity Overhaul, Track G).
 *
 * Derives 3–6 candidate handles from the user's display name and email
 * local-part, then batches availability lookups through the
 * `check_username_availability` RPC. The caller decides how many to
 * present as tap-to-fill chips.
 */

import { checkUsernameAvailability } from "@/lib/supabase/profiles";
import { isPlaceholderUsername } from "./placeholder";

export type SuggestionInput = {
  displayName?: string | null;
  email?: string | null;
};

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

function normalizeSource(raw: string | null | undefined): string {
  if (!raw) return "";
  // Decompose accented characters, strip diacritics.
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(handle: string): string {
  if (handle.length <= 20) return handle;
  return handle.slice(0, 20);
}

function padShort(handle: string, fill = "1"): string {
  while (handle.length < 3) handle += fill;
  return handle;
}

function sanitize(handle: string): string | null {
  const clean = handle.replace(/^_+|_+$/g, "").replace(/_+/g, "_");
  if (!clean) return null;
  const trimmed = truncate(clean);
  const padded = padShort(trimmed);
  if (!USERNAME_REGEX.test(padded)) return null;
  if (isPlaceholderUsername(padded)) return null;
  return padded;
}

function suffixSalt(): string {
  // Tiny numeric salt — keeps refresh button useful without leaking
  // entropy. Deterministic per call so different refreshes diverge.
  const n = Math.floor(100 + Math.random() * 900);
  return String(n);
}

/**
 * Generate raw candidate handles (unsanitized duplicates possible).
 * Public export is `generateUsernameCandidates` which de-dupes + sanitizes.
 */
function rawCandidates(input: SuggestionInput): string[] {
  const out: string[] = [];
  const display = normalizeSource(input.displayName);
  const emailLocal = normalizeSource((input.email ?? "").split("@")[0] ?? "");

  if (display) {
    const nospace = display.replace(/\s+/g, "");
    const underscored = display.replace(/\s+/g, "_");
    const firstWord = display.split(" ")[0] ?? "";
    const initials = display
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .join("");

    out.push(nospace);
    out.push(underscored);
    if (firstWord && firstWord !== nospace) out.push(firstWord);
    if (initials.length >= 2) out.push(initials);
    if (nospace) out.push(`${nospace}_${suffixSalt()}`);
  }

  if (emailLocal) {
    out.push(emailLocal);
    if (emailLocal.length >= 3) {
      out.push(`${emailLocal}_${suffixSalt().slice(0, 2)}`);
    }
  }

  return out;
}

export function generateUsernameCandidates(input: SuggestionInput): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawCandidates(input)) {
    const clean = sanitize(raw);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 8) break;
  }
  return out;
}

export type UsernameSuggestion = {
  value: string;
  available: boolean;
};

/**
 * Turn derivations into a small ordered list of available suggestions.
 * We stop after `limit` confirmed-available handles, or after we've
 * exhausted derivations.
 *
 * Availability checks run sequentially. For onboarding this is <=8
 * calls and the latency dominates the derivation itself; serializing
 * also helps avoid hammering the RPC on slow networks.
 */
export async function fetchUsernameSuggestions(
  input: SuggestionInput,
  opts: { limit?: number } = {}
): Promise<UsernameSuggestion[]> {
  const limit = opts.limit ?? 3;
  const candidates = generateUsernameCandidates(input);
  const out: UsernameSuggestion[] = [];
  for (const value of candidates) {
    if (out.length >= limit) break;
    const res = await checkUsernameAvailability(value);
    if (res.available) {
      out.push({ value, available: true });
    }
  }
  return out;
}
