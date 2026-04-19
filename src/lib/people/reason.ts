/**
 * People recommendation reason humanizer (Track 4.2)
 *
 * The RPCs return `reason_tags` and `reason_detail` (raw tokens like
 * "follow_graph" / "shared_medium" + contextual values like medium/city).
 * This module turns those into user-facing sentences via i18n.
 */

export type ReasonContext = {
  medium?: string | null;
  city?: string | null;
  keywords?: string[] | null;
};

/** Pick the best user-facing sentence for a reason-tag set. */
export function reasonTagToI18n(
  tags: readonly string[] | null | undefined,
  t: (key: string) => string,
  ctx: ReasonContext = {}
): string {
  const set = new Set((tags ?? []).map((x) => String(x).trim()).filter(Boolean));

  if (set.has("follow_graph")) return t("people.reason.followedArtistsConnected");
  if (set.has("matches_liked") || set.has("likes_based")) return t("people.reason.matchesLiked");
  if (set.has("shared_medium") && ctx.medium) {
    return t("people.reason.sharedMedium").replace("{medium}", ctx.medium);
  }
  if (set.has("same_city") && ctx.city) {
    return t("people.reason.sameCity").replace("{city}", ctx.city);
  }
  if (set.has("similar_keywords")) return t("people.reason.similarKeywords");
  if (set.has("saved_interest")) return t("people.reason.sharedInterest");

  return t("people.reason.fallback");
}
