/**
 * People recommendations: get_people_recs RPC (3 lanes) + search_people.
 */

import { supabase } from "./client";
import { ROLE_OPTIONS, encodePeopleCursor } from "./artists";
import { getSearchQueryVariants } from "@/lib/search/queryVariants";

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
  /** 0 = exact name, 1 = fuzzy name, 2 = artwork/theme match; lower is better. */
  match_rank?: number;
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

/** Search artists by artwork title/medium/story (theme). Same profile shape as search_people. */
export async function searchArtistsByArtwork(
  options: { q: string; roles?: string[] | null; limit?: number }
): Promise<{ data: PeopleRec[]; error: unknown }> {
  const { q, roles, limit = 20 } = options;
  const normalized = q.trim();
  if (!normalized) return { data: [], error: null };

  const rolesArr = Array.isArray(roles) ? roles : [];
  const cleanRoles = rolesArr.filter((r) =>
    ROLE_OPTIONS.includes(r as (typeof ROLE_OPTIONS)[number])
  );

  const { data, error } = await supabase.rpc("search_artists_by_artwork", {
    p_q: normalized,
    p_roles: cleanRoles.length > 0 ? cleanRoles : [],
    p_limit: Math.min(Math.max(limit ?? 20, 1), 50),
  });

  if (error) return { data: [], error };
  return { data: (data ?? []) as PeopleRec[], error: null };
}

/** Get "Did you mean?" suggestion when search has no or few results. */
export async function getSearchSuggestion(
  q: string
): Promise<{ suggestion: string | null; error: unknown }> {
  const normalized = q.trim();
  if (!normalized) return { suggestion: null, error: null };
  const { data, error } = await supabase.rpc("get_search_suggestion", {
    p_q: normalized,
  });
  if (error) return { suggestion: null, error };
  const suggestion = (data as { suggestion?: string | null } | null)?.suggestion ?? null;
  return { suggestion: suggestion && String(suggestion).trim() ? String(suggestion).trim() : null, error: null };
}

/** People search: name + artwork/theme, cross-language variants, ranked, optional "Did you mean?". */
export async function searchPeopleWithArtwork(
  options: SearchPeopleOptions
): Promise<{
  data: PeopleRec[];
  nextCursor: string | null;
  suggestion: string | null;
  error: unknown;
}> {
  const { q, roles, limit = 30 } = options;
  const normalized = q.trim();
  if (!normalized) return { data: [], nextCursor: null, suggestion: null, error: null };

  const variants = getSearchQueryVariants(normalized);
  const namePromises = variants.map((v) => searchPeople({ q: v, roles, limit: 40, cursor: null }));
  const artworkPromises = variants.map((v) => searchArtistsByArtwork({ q: v, roles, limit: 20 }));

  const [nameResults, artworkResults] = await Promise.all([
    Promise.all(namePromises),
    Promise.all(artworkPromises),
  ]);

  const firstError = nameResults.find((r) => r.error)?.error ?? artworkResults.find((r) => r.error)?.error;
  if (firstError) return { data: [], nextCursor: null, suggestion: null, error: firstError };

  const byId = new Map<string, PeopleRec>();
  for (const res of nameResults) {
    for (const p of res.data ?? []) {
      const rank = (p as PeopleRec).match_rank ?? 0;
      if (!byId.has(p.id) || (byId.get(p.id)!.match_rank ?? 99) > rank) byId.set(p.id, p);
    }
  }
  for (const res of artworkResults) {
    for (const p of res.data ?? []) {
      const rank = (p as PeopleRec).match_rank ?? 2;
      if (!byId.has(p.id) || (byId.get(p.id)!.match_rank ?? 99) > rank) byId.set(p.id, p);
    }
  }
  const merged = Array.from(byId.values())
    .sort((a, b) => {
      const ra = a.match_rank ?? 99;
      const rb = b.match_rank ?? 99;
      if (ra !== rb) return ra - rb;
      return 0;
    })
    .slice(0, limit);

  let suggestion: string | null = null;
  if (merged.length === 0) {
    const sugRes = await getSearchSuggestion(normalized);
    suggestion = sugRes.suggestion;
  }

  return { data: merged, nextCursor: null, suggestion, error: null };
}
