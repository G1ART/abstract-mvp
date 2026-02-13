import { supabase } from "./client";

export type PublicProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  main_role: string | null;
  roles: string[] | null;
  avatar_url: string | null;
};

const PROFILE_SELECT = "id, username, display_name, main_role, roles, avatar_url";

type ListOptions = {
  limit?: number;
  offset?: number;
};

export async function listPublicProfiles(
  options: ListOptions = {}
): Promise<{ data: PublicProfile[]; error: unknown }> {
  const { limit = 50, offset = 0 } = options;

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("is_public", true)
    .order("username", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) return { data: [], error };
  return { data: (data ?? []) as PublicProfile[], error: null };
}

type SearchOptions = {
  limit?: number;
};

export async function searchPublicProfiles(
  q: string,
  options: SearchOptions = {}
): Promise<{ data: PublicProfile[]; error: unknown }> {
  const { limit = 50 } = options;
  const normalized = q.trim().toLowerCase();
  if (!normalized) return listPublicProfiles({ limit });

  const pattern = `%${normalized}%`;
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("is_public", true)
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
    .order("username", { ascending: true })
    .limit(limit);

  if (error) return { data: [], error };
  return { data: (data ?? []) as PublicProfile[], error: null };
}

export async function getFollowingIds(): Promise<{
  data: Set<string>;
  error: unknown;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id)
    return { data: new Set(), error: new Error("Not authenticated") };

  const { data, error } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", session.user.id);

  if (error) return { data: new Set(), error };
  const ids = new Set((data ?? []).map((r) => r.following_id));
  return { data: ids, error: null };
}
