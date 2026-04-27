/**
 * Role key SSOT (Track 2.2)
 *
 * We ship a closed set of role keys. Every UI label, notification copy, and
 * role chip must translate through roleLabel(key, t) so localization stays
 * consistent.
 */

export const ROLE_KEYS = [
  "artist",
  "curator",
  "collector",
  "gallerist",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === "string" && (ROLE_KEYS as readonly string[]).includes(value);
}

/** Normalize raw role strings from the DB (trim, lowercase, filter to known). */
export function normalizeRoleList(raw: unknown): RoleKey[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<RoleKey>();
  const out: RoleKey[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const key = v.trim().toLowerCase();
    if (isRoleKey(key) && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/** True when the subject declares at least one known role (main or in array). */
export function hasAnyRole(subject: {
  main_role?: string | null;
  roles?: readonly (string | null | undefined)[] | null;
} | null | undefined): boolean {
  if (!subject) return false;
  if (isRoleKey(subject.main_role)) return true;
  return normalizeRoleList(subject.roles ?? []).length > 0;
}

/**
 * True when the subject identifies as an artist (pure artist or hybrid).
 * Hybrid users carry "artist" alongside other roles in `roles[]`, so we
 * accept either main_role === "artist" OR "artist" present in roles[].
 *
 * Used to gate artist-specific surfaces (Artist Statement editor, Statement
 * draft assist, public statement section/tab) on profiles where they would
 * be noise for non-artist viewers (curators, collectors, gallerists).
 */
export function isArtistRole(subject: {
  main_role?: string | null;
  roles?: readonly (string | null | undefined)[] | null;
} | null | undefined): boolean {
  if (!subject) return false;
  const main = typeof subject.main_role === "string"
    ? subject.main_role.trim().toLowerCase()
    : null;
  if (main === "artist") return true;
  return normalizeRoleList(subject.roles ?? []).includes("artist");
}

/** i18n label for a role key. Falls back to the key itself on unknown. */
export function roleLabel(
  key: RoleKey | null | undefined,
  t: (k: string) => string
): string {
  if (!key) return "";
  const translated = t(`role.${key}`);
  return translated && translated !== `role.${key}` ? translated : key;
}
