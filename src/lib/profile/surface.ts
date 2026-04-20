import type { Profile } from "@/lib/supabase/profiles";
import { normalizeRoleList, type RoleKey } from "@/lib/identity/roles";

/**
 * Profile surface SSOT (Track 2.4)
 *
 * `profiles.profile_details` is a legacy staging column for the upcoming
 * detail schema. The app must never surface it directly in UI. Instead,
 * every read path goes through `getProfileSurface`, which normalizes the
 * canonical shape the rest of the codebase expects.
 *
 * When a consumer needs a "detail" field (career_stage, themes, etc.),
 * it must:
 *   1. pick it from the typed top-level columns on `Profile`, or
 *   2. call `getProfileSurface(profile).details` which ONLY exposes the
 *      allow-listed keys. Arbitrary `profile_details` keys are ignored.
 */

export type ProfileSurfaceDetails = {
  career_stage: string | null;
  age_band: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  themes: readonly string[];
  mediums: readonly string[];
  styles: readonly string[];
  keywords: readonly string[];
  /** Normalized for completeness + UI; may be a single band or list (collector). */
  price_band: string | string[] | null;
  acquisition_channels: readonly string[];
  affiliation: string | null;
  program_focus: readonly string[];
  residencies: readonly unknown[];
  exhibitions: readonly unknown[];
  awards: readonly unknown[];
};

export type ProfileSurface = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  location: string | null;
  isPublic: boolean;
  mainRole: RoleKey | null;
  roles: readonly RoleKey[];
  completeness: number | null;
  details: ProfileSurfaceDetails;
};

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

function stringArrayOrEmpty(v: unknown): readonly string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

function unknownArray(v: unknown): readonly unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Align with settings: collector fields often live only under
 * `profile_details.collector_price_band` / `collector_acquisition_channels`.
 */
function normalizePriceBandField(profile: Profile, legacy: Record<string, unknown> | null): string | string[] | null {
  const top = profile.price_band;
  const fromLegacyBand = legacy?.price_band;
  const fromCollector = legacy?.collector_price_band;
  const raw = top ?? fromCollector ?? fromLegacyBand;
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const arr = stringArrayOrEmpty(raw);
    return arr.length ? [...arr] : null;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length ? raw : null;
  }
  return null;
}

function normalizeAcquisitionChannels(profile: Profile, legacy: Record<string, unknown> | null): readonly string[] {
  const top = profile.acquisition_channels;
  if (Array.isArray(top) && top.length > 0) return stringArrayOrEmpty(top);
  const leg = legacy?.acquisition_channels;
  if (Array.isArray(leg) && leg.length > 0) return stringArrayOrEmpty(leg);
  const coll = legacy?.collector_acquisition_channels;
  if (Array.isArray(coll)) return stringArrayOrEmpty(coll);
  return [];
}

function pickDetail<T>(
  top: unknown,
  legacy: Record<string, unknown> | null,
  key: string,
  extractor: (v: unknown) => T
): T {
  if (top !== undefined && top !== null) return extractor(top);
  if (legacy && key in legacy) return extractor(legacy[key]);
  return extractor(undefined);
}

/**
 * Normalize a raw Profile row into the canonical surface the UI reads.
 *
 * Consumers should always pass the data through this function before
 * rendering so that legacy `profile_details` JSON never bleeds into UI.
 */
export function getProfileSurface(profile: Profile | null | undefined): ProfileSurface | null {
  if (!profile) return null;
  const legacy = profile.profile_details ?? null;

  const roles = normalizeRoleList(profile.roles ?? []);
  const mainRole = normalizeRoleList([profile.main_role])[0] ?? null;

  const details: ProfileSurfaceDetails = {
    career_stage: pickDetail(profile.career_stage, legacy, "career_stage", stringOrNull),
    age_band: pickDetail(profile.age_band, legacy, "age_band", stringOrNull),
    city: pickDetail(profile.city, legacy, "city", stringOrNull),
    region: pickDetail(profile.region, legacy, "region", stringOrNull),
    country: pickDetail(profile.country, legacy, "country", stringOrNull),
    themes: pickDetail(profile.themes, legacy, "themes", stringArrayOrEmpty),
    mediums: pickDetail(profile.mediums, legacy, "mediums", stringArrayOrEmpty),
    styles: pickDetail(profile.styles, legacy, "styles", stringArrayOrEmpty),
    keywords: pickDetail(profile.keywords, legacy, "keywords", stringArrayOrEmpty),
    price_band: normalizePriceBandField(profile, legacy),
    acquisition_channels: normalizeAcquisitionChannels(profile, legacy),
    affiliation: pickDetail(profile.affiliation, legacy, "affiliation", stringOrNull),
    program_focus: pickDetail(
      profile.program_focus,
      legacy,
      "program_focus",
      stringArrayOrEmpty
    ),
    residencies: pickDetail(profile.residencies, legacy, "residencies", unknownArray),
    exhibitions: pickDetail(profile.exhibitions, legacy, "exhibitions", unknownArray),
    awards: pickDetail(profile.awards, legacy, "awards", unknownArray),
  };

  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    website: profile.website,
    location: profile.location,
    isPublic: profile.is_public !== false,
    mainRole,
    roles,
    completeness: profile.profile_completeness ?? null,
    details,
  };
}

/**
 * Whether the ProfileSurface has enough information to call the
 * profile "rich" (used for upsell and recommendations gating).
 */
export function isProfileRich(surface: ProfileSurface | null): boolean {
  if (!surface) return false;
  if (!surface.avatarUrl) return false;
  if (!surface.bio || surface.bio.length < 40) return false;
  if (surface.roles.length === 0) return false;
  return true;
}
