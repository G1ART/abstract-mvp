/**
 * Supabase / PostgREST error helpers.
 *
 * Historical note
 * ---------------
 * This module used to host the only `formatSupabaseError(error, fallback)`
 * helper. Beta QA found that the legacy implementation just surfaced
 * `error.message` verbatim — which leaked raw `RAISE EXCEPTION` strings
 * (e.g. `forbidden: caller is not an active account delegate writer
 * for subject_profile_id`) directly into the UI. The replacement lives
 * at `@/lib/errors/supabase` and resolves a friendly i18n message
 * via a curated catalog.
 *
 * To migrate without touching every call site at once, this file now
 * re-exports a *thin shim* with the legacy two-arg signature
 * `(error, fallback)`. New code (and any catch site you're already
 * editing) should call into `@/lib/errors/supabase` directly with
 * `(error, t, fallbackKey)` for fully localized output.
 */

import { formatSupabaseError as formatSupabaseErrorI18n } from "@/lib/errors/supabase";

/**
 * Legacy shim — accepts a literal-string fallback for backward
 * compatibility. The fallback is passed through `formatSupabaseError`
 * as-is when the error is not in the catalog: known raw `RAISE`
 * strings still resolve to friendly text via the catalog (using an
 * identity translator), and unknown errors fall back to the literal
 * string the caller provided.
 *
 * Important: this CAN return an English string in a Korean session
 * when the caller passed a literal English fallback. Prefer
 * migrating call sites to the explicit `(error, t, fallbackKey)`
 * form so the fallback is localized too.
 */
export function formatSupabaseError(error: unknown, fallback: string): string {
  // Identity translator: the catalog returns i18n keys, so without a
  // real `t` we surface the *raw English fallbacks* hard-coded in the
  // catalog. That's still strictly better than dumping
  // `error.message` (which leaked raw RAISE strings); call sites
  // should be migrated to the new helper for proper localization.
  const identityT = (key: string): string => {
    // The catalog keys we care about all start with "errors." or
    // "common.". For these, identity passthrough returns the key
    // (visible as "errors.delegate.notWriter") which is uglier than
    // a literal fallback. So if the catalog matched and returned
    // anything *different* from the caller's fallback string, prefer
    // it — but if it returns its own key, fall through to fallback.
    return key;
  };
  const out = formatSupabaseErrorI18n(error, identityT, fallback);
  // If the catalog returned a key (still looks like "errors.foo.bar"
  // or "common.foo"), it means we couldn't resolve to friendly text
  // without a translator — surface the legacy fallback instead so
  // users never see a key.
  if (/^(errors|common|artwork|delegation|priceInquiry|follow|invite|claim)\./.test(out)) {
    return fallback;
  }
  return out;
}

/**
 * Log the raw error so it appears in the browser console when the UI
 * shows a generic message. Unchanged from the original helper.
 */
export function logSupabaseError(context: string, error: unknown): void {
  console.error(`[Supabase] ${context}`, error);
}
