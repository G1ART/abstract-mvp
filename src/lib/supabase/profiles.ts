import { supabase } from "./client";

export async function lookupPublicProfileByUsername(username: string): Promise<{
  data: Record<string, unknown> | null;
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

  const isPrivate = !!data && data.is_public === false;
  const notFound = !data;

  return {
    data: data && !isPrivate ? (data as Record<string, unknown>) : null,
    isPrivate,
    notFound,
    error: null,
  };
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
