/**
 * Single entry point for rendering a delegation permission key as a
 * human-readable label. Resolution order:
 *
 *   1. The matching i18n key `delegation.permissionLabel.{key}`. If
 *      the active locale (or the EN fallback) defines it, use that.
 *   2. A humanized version of the raw key
 *      (`manage_pricing` → `Manage pricing`).
 *
 * Step 2 is the safety net that prevents UX from ever seeing
 * `delegation.permissionLabel.manage_pricing` on screen when somebody
 * adds a new permission to the SQL whitelist + UI pool but forgets to
 * register the i18n strings (we hit exactly that on 2026-04-29 with
 * `manage_pricing` / `reply_inquiries` / `manage_shortlists`).
 *
 * `useT().t()` returns the raw key when no translation is registered;
 * we detect that case by string-comparing the result and fall through
 * to humanize().
 */
export function permissionLabel(
  key: string,
  t: (key: string) => string
): string {
  const i18nKey = `delegation.permissionLabel.${key}`;
  const translated = t(i18nKey);
  if (translated && translated !== i18nKey) return translated;
  return humanizePermissionKey(key);
}

/**
 * `manage_pricing` → `Manage pricing`
 * `view`           → `View`
 * `edit_metadata`  → `Edit metadata`
 *
 * Sentence case, single space separator. Intentionally English only —
 * Korean phrasing belongs in the i18n catalog. The humanized form is
 * a fallback, not a localization strategy.
 */
export function humanizePermissionKey(key: string): string {
  if (!key) return "";
  const words = key.replace(/_/g, " ").trim();
  if (!words) return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}
