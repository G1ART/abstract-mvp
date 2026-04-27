import { supabase } from "./client";
import { saveProfileUnified } from "./profileSaveUnified";
import { PROFILE_ME_SELECT } from "./selectors";

/** Canonical profile row shape returned by getMyProfile (matches PROFILE_ME_SELECT). */
export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  main_role: string | null;
  roles: string[] | null;
  is_public: boolean | null;
  profile_details: Record<string, unknown> | null;
  profile_completeness: number | null;
  profile_updated_at: string | null;
  education: unknown[] | null;
  career_stage?: string | null;
  age_band?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  themes?: string[] | null;
  mediums?: string[] | null;
  styles?: string[] | null;
  keywords?: string[] | null;
  price_band?: string | null;
  acquisition_channels?: string[] | null;
  affiliation?: string | null;
  program_focus?: string[] | null;
  residencies?: unknown;
  exhibitions?: unknown;
  awards?: unknown;
  // P1-0 Profile Identity Surface
  cover_image_url?: string | null;
  cover_image_position_y?: number | null;
  artist_statement?: string | null;
  artist_statement_hero_image_url?: string | null;
  artist_statement_updated_at?: string | null;
};

export type ProfilePublic = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  main_role: string | null;
  roles: string[] | null;
  is_public?: boolean;
  /** Subset of profile_details exposed on public username lookup (portfolio tabs only). */
  studio_portfolio?: Record<string, unknown> | null;
  // P1-0 Profile Identity Surface (public projection)
  cover_image_url?: string | null;
  cover_image_position_y?: number | null;
  artist_statement?: string | null;
  artist_statement_hero_image_url?: string | null;
  artist_statement_updated_at?: string | null;
};

export async function lookupPublicProfileByUsername(username: string): Promise<{
  data: ProfilePublic | null;
  isPrivate: boolean;
  notFound: boolean;
  error: unknown;
}> {
  const { data, error } = await supabase.rpc("lookup_profile_by_username", {
    p_username: username.trim().toLowerCase(),
  });

  if (error) {
    return { data: null, isPrivate: false, notFound: true, error };
  }

  // Private profile: RPC returns only { is_public: false }
  const raw = data as Record<string, unknown> | null;
  const isPrivate = !!raw && raw.is_public === false;
  const notFound = !raw;

  if (notFound || isPrivate) {
    return { data: null, isPrivate, notFound, error: null };
  }

  const sp = raw?.studio_portfolio;
  const parsed: ProfilePublic = {
    id: String(raw?.id ?? ""),
    username: raw?.username != null ? String(raw.username) : null,
    display_name: raw?.display_name != null ? String(raw.display_name) : null,
    avatar_url: raw?.avatar_url != null ? String(raw.avatar_url) : null,
    bio: raw?.bio != null ? String(raw.bio) : null,
    location: raw?.location != null ? String(raw.location) : null,
    website: raw?.website != null ? String(raw.website) : null,
    main_role: raw?.main_role != null ? String(raw.main_role) : null,
    roles: Array.isArray(raw?.roles) ? (raw.roles as string[]) : null,
    is_public: raw?.is_public === true,
    studio_portfolio:
      sp != null && typeof sp === "object" && !Array.isArray(sp) ? (sp as Record<string, unknown>) : null,
    cover_image_url: stringFieldOrNull(raw?.cover_image_url),
    cover_image_position_y: numberFieldOrNull(raw?.cover_image_position_y),
    artist_statement: stringFieldOrNull(raw?.artist_statement),
    artist_statement_hero_image_url: stringFieldOrNull(raw?.artist_statement_hero_image_url),
    artist_statement_updated_at: stringFieldOrNull(raw?.artist_statement_updated_at),
  };

  return { data: parsed, isPrivate: false, notFound: false, error: null };
}

function stringFieldOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

function numberFieldOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function checkUsernameExists(
  username: string,
  excludeUserId?: string
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username.toLowerCase())
    .maybeSingle();
  if (error) return { exists: false, error };
  const exists = !!data && data.id !== excludeUserId;
  return { exists, error: null };
}

/**
 * Username availability via the `check_username_availability` RPC
 * (Onboarding Identity Overhaul, Track G). The RPC is authoritative
 * because it reuses the same `is_placeholder_username` SQL helper as
 * the auth-state RPC and knows about reserved names.
 *
 * Returns a small union so UI can render a precise message. On a
 * network / RPC error we return `"error"` instead of silently
 * treating the handle as available.
 */
export type UsernameAvailabilityReason =
  | "available"
  | "self"
  | "taken"
  | "invalid"
  | "reserved"
  | "empty"
  | "error";

export async function checkUsernameAvailability(
  username: string
): Promise<{ available: boolean; reason: UsernameAvailabilityReason }> {
  const normalized = (username ?? "").trim().toLowerCase();
  if (!normalized) return { available: false, reason: "empty" };
  const { data, error } = await supabase.rpc("check_username_availability", {
    p_username: normalized,
  });
  if (error) return { available: false, reason: "error" };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return { available: false, reason: "error" };
  }
  const r = row as { available?: unknown; reason?: unknown };
  const reasonStr = typeof r.reason === "string" ? r.reason : "error";
  const reason: UsernameAvailabilityReason = (
    ["available", "self", "taken", "invalid", "reserved", "empty", "error"] as const
  ).includes(reasonStr as UsernameAvailabilityReason)
    ? (reasonStr as UsernameAvailabilityReason)
    : "error";
  return { available: !!r.available, reason };
}

export async function getMyProfile(): Promise<{
  data: Profile | null;
  error: unknown;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: null, error: null };
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_ME_SELECT)
    .eq("id", session.user.id)
    .single();
  return { data: data as Profile | null, error };
}

/** Fetch profile by id. Allowed when caller is self or account-scope delegate (RLS). For "acting as" display. */
export async function getProfileById(profileId: string): Promise<{
  data: Profile | null;
  error: unknown;
}> {
  if (!profileId) return { data: null, error: null };
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_ME_SELECT)
    .eq("id", profileId)
    .single();
  return { data: data as Profile | null, error };
}

/** Get own profile as ProfilePublic. Used when viewing own private profile. */
export async function getMyProfileAsPublic(): Promise<{
  data: ProfilePublic | null;
  error: unknown;
}> {
  const { data, error } = await getMyProfile();
  if (error || !data) return { data: null, error };
  const row = data as Record<string, unknown>;
  const details = row?.profile_details as Record<string, unknown> | null | undefined;
  const sp = details?.studio_portfolio;
  const parsed: ProfilePublic = {
    id: String(row?.id ?? ""),
    username: row?.username != null ? String(row.username) : null,
    display_name: row?.display_name != null ? String(row.display_name) : null,
    avatar_url: row?.avatar_url != null ? String(row.avatar_url) : null,
    bio: row?.bio != null ? String(row.bio) : null,
    location: row?.location != null ? String(row.location) : null,
    website: row?.website != null ? String(row.website) : null,
    main_role: row?.main_role != null ? String(row.main_role) : null,
    roles: Array.isArray(row?.roles) ? (row.roles as string[]) : null,
    is_public: row?.is_public === true,
    studio_portfolio:
      sp != null && typeof sp === "object" && !Array.isArray(sp) ? (sp as Record<string, unknown>) : null,
    cover_image_url: stringFieldOrNull(row?.cover_image_url),
    cover_image_position_y: numberFieldOrNull(row?.cover_image_position_y),
    artist_statement: stringFieldOrNull(row?.artist_statement),
    artist_statement_hero_image_url: stringFieldOrNull(row?.artist_statement_hero_image_url),
    artist_statement_updated_at: stringFieldOrNull(row?.artist_statement_updated_at),
  };
  return { data: parsed, error: null };
}

type UpsertProfileParams = {
  username: string;
  display_name?: string;
  main_role?: string;
  roles?: string[];
};

export type EducationEntry = {
  school?: string | null;
  program?: string | null;
  year?: string | number | null;
  type?: string | null;
};

export type UpdateProfileParams = {
  display_name?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  avatar_url?: string | null;
  main_role?: string | null;
  roles?: string[] | null;
  is_public?: boolean;
  career_stage?: string | null;
  age_band?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  themes?: string[] | null;
  mediums?: string[] | null;
  styles?: string[] | null;
  keywords?: string[] | null;
  education?: EducationEntry[] | null;
  price_band?: string | null;
  acquisition_channels?: string[] | null;
  affiliation?: string | null;
  program_focus?: string[] | null;
  residencies?: unknown[] | null;
  exhibitions?: unknown[] | null;
  awards?: unknown[] | null;
  profile_completeness?: number | null;
  profile_updated_at?: string | null;
  // P1-0 identity surface
  cover_image_url?: string | null;
  cover_image_position_y?: number | null;
  artist_statement?: string | null;
  artist_statement_hero_image_url?: string | null;
};

/** Base-only columns for profiles table (no details). */
const BASE_PROFILE_KEYS = [
  "display_name",
  "bio",
  "location",
  "website",
  "avatar_url",
  "main_role",
  "roles",
  "is_public",
  "education",
  "profile_completeness",
  "profile_updated_at",
  // P1-0 identity surface
  "cover_image_url",
  "cover_image_position_y",
  "artist_statement",
  "artist_statement_hero_image_url",
] as const;

export type UpdateProfileBaseParams = {
  display_name?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  avatar_url?: string | null;
  main_role?: string | null;
  roles?: string[] | null;
  is_public?: boolean;
  education?: EducationEntry[] | null;
  profile_completeness?: number | null;
  profile_updated_at?: string | null;
  // P1-0 identity surface
  cover_image_url?: string | null;
  cover_image_position_y?: number | null;
  artist_statement?: string | null;
  artist_statement_hero_image_url?: string | null;
};

/** Update only base profile fields via RPC (no direct PATCH). */
export async function updateMyProfileBase(partial: UpdateProfileBaseParams) {
  const updates: Record<string, unknown> = {};
  for (const key of BASE_PROFILE_KEYS) {
    if (key in partial && partial[key] !== undefined) {
      updates[key] = partial[key];
    }
  }
  if (Object.keys(updates).length === 0) {
    return { data: null, error: null };
  }
  const res = await saveProfileUnified({
    basePatch: updates,
    detailsPatch: {},
    completeness: (partial.profile_completeness ?? null) as number | null,
  });
  if (!res.ok) return { data: null, error: res };
  return { data: res.data as { id: string; username: string | null } & Record<string, unknown>, error: null };
}

/** Patch update via RPC (no direct PATCH). Skips if patch empty. */
export async function updateMyProfileBasePatch(patch: Partial<UpdateProfileBaseParams>): Promise<{
  data: { id: string; username: string | null; profile_completeness: number | null; profile_details: Record<string, unknown> | null } | null;
  error: unknown;
  skipped?: boolean;
}> {
  const allowed = new Set(BASE_PROFILE_KEYS);
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (allowed.has(key as (typeof BASE_PROFILE_KEYS)[number]) && value !== undefined) {
      updates[key] = value;
    }
  }
  if (Object.keys(updates).length === 0) {
    return { data: null, error: null, skipped: true };
  }
  const res = await saveProfileUnified({
    basePatch: updates,
    detailsPatch: {},
    completeness: (patch.profile_completeness ?? null) as number | null,
  });
  if (!res.ok) return { data: null, error: res };
  return {
    data: res.data as { id: string; username: string | null; profile_completeness: number | null; profile_details: Record<string, unknown> | null },
    error: null,
  };
}

/** Update profile via RPC (no direct PATCH). Base fields in basePatch, details in detailsPatch. */
export async function updateMyProfile(partial: UpdateProfileParams) {
  const baseKeys = [
    "display_name", "bio", "location", "website", "avatar_url", "main_role", "roles", "is_public",
    "education", "profile_completeness", "profile_updated_at",
    "cover_image_url", "cover_image_position_y", "artist_statement", "artist_statement_hero_image_url",
  ] as const;
  const detailKeys = [
    "career_stage", "age_band", "city", "region", "country", "themes", "mediums", "styles",
    "keywords", "price_band", "acquisition_channels", "affiliation", "program_focus",
    "residencies", "exhibitions", "awards",
  ] as const;
  const basePatch: Record<string, unknown> = {};
  const detailsPatch: Record<string, unknown> = {};
  for (const k of baseKeys) {
    if (k in partial && partial[k] !== undefined) basePatch[k] = partial[k];
  }
  for (const k of detailKeys) {
    if (k in partial && partial[k] !== undefined) detailsPatch[k] = partial[k];
  }
  if (Object.keys(basePatch).length === 0 && Object.keys(detailsPatch).length === 0) {
    return { data: null, error: null };
  }
  const res = await saveProfileUnified({
    basePatch,
    detailsPatch,
    completeness: (partial.profile_completeness ?? null) as number | null,
  });
  if (!res.ok) return { data: null, error: res };
  return { data: res.data, error: null };
}

/** Onboarding: create/update profile via RPC (no direct upsert). */
export async function upsertProfile(params: UpsertProfileParams) {
  const { username, ...rest } = params;
  const res = await saveProfileUnified({
    basePatch: { username: username.toLowerCase(), ...rest },
    detailsPatch: {},
    completeness: null,
  });
  if (!res.ok) return { data: null, error: res };
  return { data: res.data, error: null };
}
