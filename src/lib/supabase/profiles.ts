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
  };

  return { data: parsed, isPrivate: false, notFound: false, error: null };
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

/** Get own profile as ProfilePublic. Used when viewing own private profile. */
export async function getMyProfileAsPublic(): Promise<{
  data: ProfilePublic | null;
  error: unknown;
}> {
  const { data, error } = await getMyProfile();
  if (error || !data) return { data: null, error };
  const row = data as Record<string, unknown>;
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
  try {
    const row = await saveProfileUnified({
      basePatch: updates,
      detailsPatch: {},
      completeness: (partial.profile_completeness ?? null) as number | null,
    });
    return { data: row as { id: string; username: string | null } & Record<string, unknown>, error: null };
  } catch (error) {
    return { data: null, error };
  }
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
  try {
    const row = await saveProfileUnified({
      basePatch: updates,
      detailsPatch: {},
      completeness: (patch.profile_completeness ?? null) as number | null,
    });
    return {
      data: row as { id: string; username: string | null; profile_completeness: number | null; profile_details: Record<string, unknown> | null },
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
}

/** Update profile via RPC (no direct PATCH). Base fields in basePatch, details in detailsPatch. */
export async function updateMyProfile(partial: UpdateProfileParams) {
  const baseKeys = [
    "display_name", "bio", "location", "website", "avatar_url", "main_role", "roles", "is_public",
    "education", "profile_completeness", "profile_updated_at",
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
  try {
    const row = await saveProfileUnified({
      basePatch,
      detailsPatch,
      completeness: (partial.profile_completeness ?? null) as number | null,
    });
    return { data: row, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** Onboarding: create/update profile via RPC (no direct upsert). */
export async function upsertProfile(params: UpsertProfileParams) {
  const { username, ...rest } = params;
  try {
    const row = await saveProfileUnified({
      basePatch: { username: username.toLowerCase(), ...rest },
      detailsPatch: {},
      completeness: null,
    });
    return { data: row, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
