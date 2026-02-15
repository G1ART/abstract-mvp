/**
 * People recommendations: get_people_recs RPC (3 lanes) + search_people.
 */

import { supabase } from "./client";
import { ROLE_OPTIONS, encodePeopleCursor } from "./artists";

export { ROLE_OPTIONS };

export type PeopleRecMode = "follow_graph" | "likes_based" | "expand";

export type PeopleRec = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
  main_role: string | null;
  roles: string[] | null;
  is_public?: boolean;
  reason_tags?: string[];
  reason_detail?: Record<string, unknown>;
  mutual_follow_sources?: number;
  liked_artists_count?: number;
};

export type GetPeopleRecsOptions = {
  mode: PeopleRecMode;
  roles?: string[] | null;
  limit?: number;
  cursor?: string | null;
};

export async function getPeopleRecs(
  options: GetPeopleRecsOptions
): Promise<{ data: PeopleRec[]; nextCursor: string | null; error: unknown }> {
  const { mode, roles, limit = 15, cursor = null } = options;
  const rolesArr = Array.isArray(roles) ? roles : [];
  const cleanRoles = rolesArr.filter((r) =>
    ROLE_OPTIONS.includes(r as (typeof ROLE_OPTIONS)[number])
  );

  const { data, error } = await supabase.rpc("get_people_recs", {
    p_mode: mode,
    p_roles: cleanRoles.length > 0 ? cleanRoles : [],
    p_limit: Math.min(Math.max(limit ?? 15, 1), 50),
    p_cursor: cursor ?? null,
  });

  if (error) return { data: [], nextCursor: null, error };
  const rows = (data ?? []) as PeopleRec[];
  const nextCursor =
    rows.length >= (limit ?? 15) && rows[rows.length - 1]?.id
      ? encodePeopleCursor(rows[rows.length - 1].id)
      : null;
  return { data: rows, nextCursor, error: null };
}

export type SearchPeopleOptions = {
  q: string;
  roles?: string[] | null;
  limit?: number;
  cursor?: string | null;
};

export async function searchPeople(
  options: SearchPeopleOptions
): Promise<{ data: PeopleRec[]; nextCursor: string | null; error: unknown }> {
  const { q, roles, limit = 15, cursor = null } = options;
  const normalized = q.trim();
  if (!normalized) return { data: [], nextCursor: null, error: null };

  const rolesArr = Array.isArray(roles) ? roles : [];
  const cleanRoles = rolesArr.filter((r) =>
    ROLE_OPTIONS.includes(r as (typeof ROLE_OPTIONS)[number])
  );

  const { data, error } = await supabase.rpc("search_people", {
    p_q: normalized,
    p_roles: cleanRoles.length > 0 ? cleanRoles : [],
    p_limit: limit ?? 15,
    p_cursor: cursor ?? null,
  });

  if (error) return { data: [], nextCursor: null, error };
  const rows = (data ?? []) as PeopleRec[];
  const nextCursor =
    rows.length >= (limit ?? 15) && rows[rows.length - 1]?.id
      ? encodePeopleCursor(rows[rows.length - 1].id)
      : null;
  return { data: rows, nextCursor, error: null };
}
