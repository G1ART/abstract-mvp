import { supabase } from "./client";

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

const MY_PROFILE_SELECT =
  "id, username, display_name, bio, location, website, avatar_url, main_role, roles, is_public, career_stage, age_band, city, region, country, themes, mediums, styles, keywords, education, price_band, acquisition_channels, affiliation, program_focus, residencies, exhibitions, awards, profile_completeness, profile_updated_at";

export async function getMyProfile() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: null, error: null };
  const { data, error } = await supabase
    .from("profiles")
    .select(MY_PROFILE_SELECT)
    .eq("id", session.user.id)
    .single();
  return { data, error };
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

/** Update only base profile fields. Returns id, username. */
export async function updateMyProfileBase(partial: UpdateProfileBaseParams) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id)
    return { data: null, error: new Error("Not authenticated") };

  const updates: Record<string, unknown> = {};
  for (const key of BASE_PROFILE_KEYS) {
    if (key in partial && partial[key] !== undefined) {
      updates[key] = partial[key];
    }
  }
  if (Object.keys(updates).length === 0) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", session.user.id)
    .select("id, username")
    .single();

  return { data, error };
}

export async function updateMyProfile(partial: UpdateProfileParams) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id)
    return { data: null, error: new Error("Not authenticated") };

  const allowed = [
    "display_name",
    "bio",
    "location",
    "website",
    "avatar_url",
    "main_role",
    "roles",
    "is_public",
    "career_stage",
    "age_band",
    "city",
    "region",
    "country",
    "themes",
    "mediums",
    "styles",
    "keywords",
    "education",
    "price_band",
    "acquisition_channels",
    "affiliation",
    "program_focus",
    "residencies",
    "exhibitions",
    "awards",
    "profile_completeness",
    "profile_updated_at",
  ] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in partial && partial[key] !== undefined) {
      updates[key] = partial[key];
    }
  }
  if (Object.keys(updates).length === 0) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", session.user.id)
    .select()
    .single();

  return { data, error };
}

export async function upsertProfile(params: UpsertProfileParams) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: null, error: new Error("Not authenticated") };
  const { username, ...rest } = params;
  return supabase
    .from("profiles")
    .upsert(
      { id: session.user.id, username: username.toLowerCase(), ...rest },
      { onConflict: "id" }
    )
    .select()
    .single();
}
