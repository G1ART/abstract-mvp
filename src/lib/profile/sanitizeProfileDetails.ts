/**
 * Sanitize profile details before save to avoid "Failed to save" (empty strings, invalid types, empty rows).
 */

import type { EducationEntry } from "@/lib/supabase/profiles";

function trimToNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

function sanitizeStringArray(
  arr: string[] | null | undefined,
  maxItems?: number
): string[] | null {
  if (!Array.isArray(arr)) return null;
  const trimmed = arr
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0);
  const deduped = [...new Set(trimmed)];
  const limited = maxItems ? deduped.slice(0, maxItems) : deduped;
  return limited.length === 0 ? null : limited;
}

function parseYear(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const s = String(value).trim();
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export type SanitizedEducationEntry = {
  school: string | null;
  program: string | null;
  year: number | null;
  type: string | null;
};

function sanitizeEducationRow(
  row: EducationEntry | Record<string, unknown>
): SanitizedEducationEntry | null {
  const school = trimToNull((row as { school?: string }).school);
  const program = trimToNull((row as { program?: string }).program);
  const rawYear = (row as { year?: string | number }).year;
  const year = parseYear(rawYear);
  const typeRaw = (row as { type?: string | null }).type;
  const type =
    typeRaw != null && String(typeRaw).trim() !== ""
      ? String(typeRaw).trim()
      : null;
  if (school == null && program == null && year == null && type == null) {
    return null;
  }
  return { school: school ?? null, program: program ?? null, year, type };
}

export type ProfileDetailsInput = {
  display_name?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  career_stage?: string | null;
  age_band?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  themes?: string[] | null;
  mediums?: string[] | null;
  styles?: string[] | null;
  keywords?: string[] | null;
  education?: EducationEntry[] | unknown[] | null;
  price_band?: string | null;
  acquisition_channels?: string[] | null;
  affiliation?: string | null;
  program_focus?: string[] | null;
};

export type SanitizedProfileDetails = {
  display_name: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  career_stage: string | null;
  age_band: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  themes: string[] | null;
  mediums: string[] | null;
  styles: string[] | null;
  keywords: string[] | null;
  education: SanitizedEducationEntry[] | null;
  price_band: string | null;
  acquisition_channels: string[] | null;
  affiliation: string | null;
  program_focus: string[] | null;
};

export function sanitizeProfileDetails(
  input: ProfileDetailsInput
): SanitizedProfileDetails {
  const educationRaw = Array.isArray(input.education) ? input.education : [];
  const educationRows = educationRaw
    .map((row) => sanitizeEducationRow(row as EducationEntry))
    .filter((r): r is SanitizedEducationEntry => r != null);

  return {
    display_name: trimToNull(input.display_name),
    bio: trimToNull(input.bio),
    location: trimToNull(input.location),
    website: trimToNull(input.website),
    career_stage: trimToNull(input.career_stage),
    age_band: trimToNull(input.age_band),
    city: trimToNull(input.city),
    region: trimToNull(input.region),
    country: trimToNull(input.country),
    themes: sanitizeStringArray(input.themes, 5),
    mediums: sanitizeStringArray(input.mediums, 4),
    styles: sanitizeStringArray(input.styles, 6),
    keywords: sanitizeStringArray(input.keywords, 10),
    education:
      educationRows.length === 0 ? null : educationRows,
    price_band: trimToNull(input.price_band),
    acquisition_channels: sanitizeStringArray(
      input.acquisition_channels,
      4
    ),
    affiliation: trimToNull(input.affiliation),
    program_focus: sanitizeStringArray(input.program_focus, 5),
  };
}
