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

export async function getMyProfile() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: null, error: null };
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();
  return { data, error };
}

type UpsertProfileParams = {
  username: string;
  display_name?: string;
  main_role?: string;
  roles?: string[];
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
};

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
