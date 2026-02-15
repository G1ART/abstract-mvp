import { supabase } from "./client";

export type PublicProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  main_role: string | null;
  roles: string[] | null;
  avatar_url: string | null;
  bio?: string | null;
  reason?: string;
  reason_tags?: string[];
  reason_detail?: {
    sharedThemesTop?: string[];
    sharedSchool?: string;
  };
};

export const ROLE_OPTIONS = ["artist", "curator", "gallerist", "collector"] as const;

/** Encode UUID as cursor for next page */
export function encodePeopleCursor(id: string): string {
  if (typeof btoa !== "undefined") {
    return btoa(id);
  }
  return Buffer.from(id, "utf8").toString("base64");
}

export type GetRecommendedPeopleOptions = {
  roles?: string[];
  limit: number;
  cursor?: string | null;
};

export async function getRecommendedPeople(
  options: GetRecommendedPeopleOptions
): Promise<{ data: PublicProfile[]; nextCursor: string | null; error: unknown }> {
  const { roles = [], limit = 15, cursor = null } = options;
  const rolesArr = Array.isArray(roles) ? roles : [];
  const cleanRoles = rolesArr.filter((r) => ROLE_OPTIONS.includes(r as (typeof ROLE_OPTIONS)[number]));

  const { data, error } = await supabase.rpc("get_recommended_people", {
    p_roles: cleanRoles,
    p_limit: limit,
    p_cursor: cursor || null,
  });

  if (error) return { data: [], nextCursor: null, error };
  const rows = (data ?? []) as PublicProfile[];
  const nextCursor = rows.length >= limit && rows[rows.length - 1]?.id
    ? encodePeopleCursor(rows[rows.length - 1].id)
    : null;
  return { data: rows, nextCursor, error: null };
}

export type SearchPeopleOptions = {
  q: string;
  roles?: string[];
  limit: number;
  cursor?: string | null;
};

export async function searchPeople(
  options: SearchPeopleOptions
): Promise<{ data: PublicProfile[]; nextCursor: string | null; error: unknown }> {
  const { q, roles = [], limit = 15, cursor = null } = options;
  const normalized = q.trim();
  if (!normalized) return { data: [], nextCursor: null, error: null };

  const rolesArr = Array.isArray(roles) ? roles : [];
  const cleanRoles = rolesArr.filter((r) => ROLE_OPTIONS.includes(r as (typeof ROLE_OPTIONS)[number]));

  const { data, error } = await supabase.rpc("search_people", {
    p_q: normalized,
    p_roles: cleanRoles,
    p_limit: limit,
    p_cursor: cursor || null,
  });

  if (error) return { data: [], nextCursor: null, error };
  const rows = (data ?? []) as PublicProfile[];
  const nextCursor = rows.length >= limit && rows[rows.length - 1]?.id
    ? encodePeopleCursor(rows[rows.length - 1].id)
    : null;
  return { data: rows, nextCursor, error: null };
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
