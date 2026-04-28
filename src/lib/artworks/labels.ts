/**
 * Artwork taxonomy → i18n key mapping.
 *
 * Centralized so any surface that needs to render `ownership_status`
 * or `pricing_mode` (artwork detail, ArtworkCard, library filters,
 * upload/edit selects, …) shares one source of truth and never falls
 * back to printing the raw enum value (e.g. `not_for_sale`) on screen.
 *
 * Add a new value here AND in `src/lib/i18n/messages.ts` (both
 * locales) — the helper functions return `null` for unknown values
 * so callers can decide whether to hide the field or render a
 * fallback.
 */

const OWNERSHIP_LABEL_KEY: Record<string, string> = {
  available: "upload.ownershipAvailable",
  owned: "upload.ownershipOwned",
  sold: "upload.ownershipSold",
  not_for_sale: "upload.ownershipNotForSale",
};

const PRICING_LABEL_KEY: Record<string, string> = {
  fixed: "artwork.pricing.fixed",
  inquire: "artwork.pricing.inquire",
};

/**
 * Resolve an `ownership_status` raw value to its localized label.
 * Returns `null` for unknown values so the caller can choose to hide
 * the field rather than render `not_for_sale` literally.
 */
export function ownershipStatusLabel(
  status: string | null | undefined,
  t: (key: string) => string,
): string | null {
  if (!status) return null;
  const key = OWNERSHIP_LABEL_KEY[status];
  if (!key) return null;
  const out = t(key);
  // The translator returns the raw key when a string is missing —
  // detect that and bail to null so we never surface a key as text.
  return out === key ? null : out;
}

export function pricingModeLabel(
  mode: string | null | undefined,
  t: (key: string) => string,
): string | null {
  if (!mode) return null;
  const key = PRICING_LABEL_KEY[mode];
  if (!key) return null;
  const out = t(key);
  return out === key ? null : out;
}
