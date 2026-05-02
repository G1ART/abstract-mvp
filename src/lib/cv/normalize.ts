/**
 * CV import normalizers (P6.3).
 *
 * Two helpers used by the route's `normalizeResult` and the wizard's
 * preview step to keep AI output aligned with the manual editor's
 * single source of truth — the Settings taxonomy.
 *
 * 1. `normalizeEducationType(raw)` — maps the messy free text the model
 *    returns ("BFA", "Bachelor of Fine Arts", "학사", "B.A.") to one
 *    of the enum slugs the manual editor accepts (`hs_art | ba | bfa
 *    | ma | mfa | phd | other`). Unknown values become null so the
 *    field drops out of `fields` rather than carrying a junk label.
 *
 * 2. `signatureForEntry` + `entriesAreSimilar` — string-similarity
 *    helpers the wizard uses to mark imported entries that already
 *    look like an existing CV row, so the user can opt out of writing
 *    a duplicate.
 */

import type { CvImportCategory } from "@/lib/ai/types";
import type { CvEntry } from "@/lib/supabase/profiles";

/* ------------------------------- type enum ------------------------------- */

export const EDUCATION_TYPE_VALUES = ["hs_art", "ba", "bfa", "ma", "mfa", "phd", "other"] as const;
export type EducationTypeSlug = (typeof EDUCATION_TYPE_VALUES)[number];

/**
 * Greedy normalizer: we strip punctuation / whitespace, lowercase,
 * then run a battery of substring matches in the order strict→loose.
 * The order matters — "bfa" must match before the "ba" fallback so a
 * Bachelor of Fine Arts is never silently demoted to a plain BA.
 */
export function normalizeEducationType(raw: unknown): EducationTypeSlug | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Direct slug match (the model already returned a clean enum value).
  const lower = s.toLowerCase();
  if ((EDUCATION_TYPE_VALUES as readonly string[]).includes(lower)) {
    return lower as EducationTypeSlug;
  }

  // Strip non-letters (keeps Korean syllables) and lower-case for matching.
  const stripped = lower.replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();

  // Strict acronyms first.
  if (/(?:^|\s)bfa(?:\s|$)/.test(stripped)) return "bfa";
  if (/(?:^|\s)mfa(?:\s|$)/.test(stripped)) return "mfa";
  if (/(?:^|\s)phd(?:\s|$)/.test(stripped) || /(?:^|\s)dphil(?:\s|$)/.test(stripped)) return "phd";
  if (/(?:^|\s)b\s?a(?:\s|$)/.test(stripped)) return "ba";
  if (/(?:^|\s)m\s?a(?:\s|$)/.test(stripped)) return "ma";

  // Long-form English / Korean.
  if (/bachelor\s+of\s+fine\s+arts?/.test(stripped)) return "bfa";
  if (/master\s+of\s+fine\s+arts?/.test(stripped)) return "mfa";
  if (/doctor(?:ate|al)?|phd|ph\s?d|박사/.test(stripped)) return "phd";
  if (/master|graduate|석사|대학원/.test(stripped)) return "ma";
  if (/bachelor|undergrad(?:uate)?|학사|학부/.test(stripped)) return "ba";
  if (/(art|fine\s*arts?|예술|미술)\s*(high\s*school|고등학교|예고)/.test(stripped))
    return "hs_art";
  if (/예술고|예술\s*고등학교|미술고|미술\s*고등학교/.test(stripped)) return "hs_art";

  // Diploma / certificate fall back to "other" so they don't
  // disappear silently.
  if (/diploma|certificate|certif|수료|자격증/.test(stripped)) return "other";

  return null;
}

/* ----------------------------- duplicate match --------------------------- */

/**
 * Build a comparable signature for a CV entry. We pick a small set of
 * "primary" fields per category and normalize them aggressively
 * (lowercase + drop punctuation + drop "Solo:" / "Group:" prefixes
 * the prompt asks the model to keep).
 *
 * The resulting string is stable across the manual editor and the
 * import route, so we can detect duplicates that differ only in case
 * or punctuation. Returns `null` when the entry is too sparse to
 * match meaningfully (otherwise an empty entry would match every
 * other empty entry).
 */
export function signatureForEntry(
  category: CvImportCategory,
  fields: Record<string, unknown>,
): string | null {
  const get = (k: string) => normalizeText(asString(fields[k]));

  if (category === "education") {
    const school = get("school");
    if (!school) return null;
    return `edu|${school}|${get("program")}|${get("year")}`;
  }
  if (category === "exhibitions") {
    const title = stripExhibitionPrefix(get("title"));
    if (!title) return null;
    return `exh|${title}|${get("venue")}|${get("year")}`;
  }
  if (category === "awards") {
    const name = get("name");
    if (!name) return null;
    return `awd|${name}|${get("organization")}|${get("year")}`;
  }
  // residencies
  const name = get("name");
  if (!name) return null;
  return `res|${name}|${get("location")}|${get("year_from")}|${get("year_to")}|${get("year")}`;
}

/**
 * `true` when two entries share the same normalized primary signature
 * OR when the title-only signature matches with a year overlap. The
 * year overlap rule keeps "Quiet Rooms / Galerie X / 2022" matched
 * against "Quiet Rooms / 2022" even when the venue is missing.
 */
export function entriesAreSimilar(
  category: CvImportCategory,
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const sa = signatureForEntry(category, a);
  const sb = signatureForEntry(category, b);
  if (!sa || !sb) return false;
  if (sa === sb) return true;

  // Looser fallback: primary text + year. Catches cases where one
  // side has the venue and the other doesn't.
  const primaryA = primaryTextFor(category, a);
  const primaryB = primaryTextFor(category, b);
  if (!primaryA || !primaryB) return false;
  if (primaryA !== primaryB) return false;
  const yearA = primaryYearFor(category, a);
  const yearB = primaryYearFor(category, b);
  if (!yearA || !yearB) return false;
  return yearA === yearB;
}

/**
 * Find the index in `baseline` that is similar to `candidate`, or
 * -1 when nothing matches. Returns the first hit; the wizard only
 * needs to know whether *any* duplicate exists.
 */
export function findSimilarIndex(
  category: CvImportCategory,
  candidate: Record<string, unknown>,
  baseline: CvEntry[],
): number {
  for (let i = 0; i < baseline.length; i += 1) {
    if (entriesAreSimilar(category, candidate, baseline[i])) return i;
  }
  return -1;
}

/* --------------------------------- utils -------------------------------- */

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-") // unify dash variants
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop "solo:" / "group:" / "duo:" prefix the prompt asks the model to add. */
function stripExhibitionPrefix(s: string): string {
  return s
    .replace(/^\s*(solo|group|duo|two[- ]person|three[- ]person)\s*[:\-–—]\s*/i, "")
    .trim();
}

function primaryTextFor(
  category: CvImportCategory,
  fields: Record<string, unknown>,
): string {
  if (category === "education") return normalizeText(asString(fields.school));
  if (category === "exhibitions")
    return stripExhibitionPrefix(normalizeText(asString(fields.title)));
  if (category === "awards") return normalizeText(asString(fields.name));
  return normalizeText(asString(fields.name));
}

function primaryYearFor(
  category: CvImportCategory,
  fields: Record<string, unknown>,
): string {
  // Prefer single year for exhibitions / awards / education; for
  // residencies the import uses year_from/year_to but the editor
  // sometimes keeps a single `year`. We pick whichever is present.
  const y = asString(fields.year);
  if (y) return y;
  if (category === "residencies") {
    const yf = asString(fields.year_from);
    if (yf) return yf;
    const yt = asString(fields.year_to);
    if (yt) return yt;
  }
  return "";
}
