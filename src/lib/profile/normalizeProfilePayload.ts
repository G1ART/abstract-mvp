/**
 * Normalize profile payload for DB: placeholder/empty/default → null.
 * Use before save to avoid invalid values (e.g. website="https://", select="", empty arrays).
 */

const MAIN_ROLES = ["artist", "collector", "curator", "gallerist"] as const;

/** "" or "https://" or "http://" → null; URL() parse fail → null */
export function normalizeUrl(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === "" || s === "https://" || s === "http://") return null;
  try {
    new URL(s);
    return s;
  } catch {
    return null;
  }
}

/** "Select" / "" / null → null */
export function normalizeOptionalSelect(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  if (s === "" || s === "select") return null;
  return s;
}

/** trim 후 "" → null */
export function normalizeString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/** Bio: trim edges only, preserve internal newlines (\\n). "" → null */
export function normalizeBioString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).trim(); // trim only leading/trailing, preserves \n
  return s === "" ? null : s;
}

/** undefined/null → null; filter empty/whitespace, length 0 → null */
export function normalizeStringArray(
  arr: string[] | null | undefined
): string[] | null {
  if (arr == null) return null;
  if (!Array.isArray(arr)) return null;
  const trimmed = arr
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0);
  const deduped = [...new Set(trimmed)];
  return deduped.length === 0 ? null : deduped;
}

export type EducationEntryInput = {
  school?: string | null;
  program?: string | null;
  year?: string | number | null;
  type?: string | null;
};

export type EducationEntryNormalized = {
  school: string | null;
  program: string | null;
  year: number | null;
  type: string | null;
};

/** Empty row (all blank) → skip; trim strings, parse year */
function normalizeEducationRow(
  row: EducationEntryInput | Record<string, unknown>
): EducationEntryNormalized | null {
  const school = normalizeString((row as { school?: string }).school);
  const program = normalizeString((row as { program?: string }).program);
  const rawYear = (row as { year?: string | number }).year;
  let year: number | null = null;
  if (rawYear != null) {
    if (typeof rawYear === "number" && Number.isFinite(rawYear)) year = rawYear;
    else {
      const s = String(rawYear).trim();
      if (s !== "") {
        const n = parseInt(s, 10);
        if (Number.isFinite(n)) year = n;
      }
    }
  }
  const typeRaw = (row as { type?: string | null }).type;
  const type =
    typeRaw != null && String(typeRaw).trim() !== ""
      ? String(typeRaw).trim()
      : null;
  if (school == null && program == null && year == null && type == null) {
    return null;
  }
  return {
    school: school ?? null,
    program: program ?? null,
    year,
    type: type ?? null,
  };
}

/** Base profile payload (profiles table): display_name, bio, location, website, main_role, roles, is_public, education. */
export type NormalizedBaseInput = {
  display_name?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  main_role?: string | null;
  roles?: string[] | null;
  is_public?: boolean | null;
  education?: EducationEntryInput[] | unknown[] | null;
};

export type NormalizedBasePayload = {
  display_name: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  main_role: string | null;
  roles: string[];
  is_public: boolean;
  education: EducationEntryNormalized[] | null;
};

/**
 * Normalize base profile. roles: min 1 required (caller must block save if 0).
 * main_role: must be in MAIN_ROLES else null.
 */
export function normalizeProfileBase(input: NormalizedBaseInput): NormalizedBasePayload {
  const rawRoles = normalizeStringArray(input.roles ?? []);
  const roles = (rawRoles && rawRoles.length > 0 ? rawRoles : []) as string[];
  const mainRoleRaw = normalizeOptionalSelect(input.main_role) ?? normalizeString(input.main_role);
  const main_role =
    mainRoleRaw && MAIN_ROLES.includes(mainRoleRaw as (typeof MAIN_ROLES)[number])
      ? mainRoleRaw
      : roles[0] ?? null;

  const educationRaw = Array.isArray(input.education) ? input.education : [];
  const education = educationRaw
    .map((row) => normalizeEducationRow(row as EducationEntryInput))
    .filter((r): r is EducationEntryNormalized => r != null);
  const educationFinal = education.length === 0 ? null : education;

  return {
    display_name: normalizeString(input.display_name),
    bio: normalizeBioString(input.bio),
    location: normalizeString(input.location),
    website: normalizeUrl(input.website),
    main_role,
    roles,
    is_public: input.is_public ?? true,
    education: educationFinal,
  };
}

/** Details payload (profiles.profile_details jsonb). */
export type NormalizedDetailsInput = {
  career_stage?: string | null;
  age_band?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  themes?: string[] | null;
  mediums?: string[] | null;
  styles?: string[] | null;
  keywords?: string[] | null;
  price_band?: string | string[] | null;
  acquisition_channels?: string[] | null;
  affiliation?: string | null;
  program_focus?: string[] | null;
};

export type NormalizedDetailsPayload = {
  career_stage: string | null;
  age_band: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  themes: string[] | null;
  mediums: string[] | null;
  styles: string[] | null;
  keywords: string[] | null;
  price_band: string[] | null;
  acquisition_channels: string[] | null;
  affiliation: string | null;
  program_focus: string[] | null;
};

/** Enum-like fields: "" → null. Arrays: empty → null. */
export function normalizeProfileDetails(input: NormalizedDetailsInput): NormalizedDetailsPayload {
  return {
    career_stage: normalizeOptionalSelect(input.career_stage) ?? normalizeString(input.career_stage),
    age_band: normalizeOptionalSelect(input.age_band) ?? normalizeString(input.age_band),
    city: normalizeString(input.city),
    region: normalizeOptionalSelect(input.region) ?? normalizeString(input.region),
    country: normalizeString(input.country),
    themes: normalizeStringArray(input.themes ?? []),
    mediums: normalizeStringArray(input.mediums ?? []),
    styles: normalizeStringArray(input.styles ?? []),
    keywords: normalizeStringArray(input.keywords ?? []),
    price_band: (() => {
      const v = input.price_band;
      if (v == null) return null;
      if (Array.isArray(v)) return normalizeStringArray(v);
      const s = normalizeOptionalSelect(v) ?? normalizeString(v);
      return s ? [s] : null;
    })(),
    acquisition_channels: normalizeStringArray(input.acquisition_channels ?? []),
    affiliation: normalizeOptionalSelect(input.affiliation) ?? normalizeString(input.affiliation),
    program_focus: normalizeStringArray(input.program_focus ?? []),
  };
}
