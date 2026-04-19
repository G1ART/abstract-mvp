/**
 * People recommendations — single contract (Track 4.3 / Next Upgrade Track D)
 *
 * Before this module, the UI code had to know about four different RPCs
 * (`get_people_recs`, `get_recommended_people`, `search_people`,
 * `searchPeopleWithArtwork`) and switch between them based on feature flag /
 * viewport. The consolidated contract collapses that to one function with a
 * `lane` parameter plus an optional `searchVariant` for the /people search
 * merged-by-artwork ranking.
 */

import type { PeopleRec, PeopleRecMode } from "./peopleRecs";
import { getPeopleRecs, searchPeople, searchPeopleWithArtwork } from "./peopleRecs";

export type PeopleLane = "follow_graph" | "likes_based" | "expand" | "search";

/**
 * `merged` — name + artwork/theme variants, ranked. Matches the full People
 *   search experience (with "Did you mean?" suggestion).
 * `name_only` — vanilla `search_people` RPC, no artwork join. Use for
 *   typeahead and lightweight lanes that don't need artwork matching.
 */
export type PeopleSearchVariant = "merged" | "name_only";

export type GetPeopleRecommendationsOptions = {
  lane: PeopleLane;
  q?: string;
  roles?: string[] | null;
  limit?: number;
  cursor?: string | null;
  /** Only meaningful when `lane === "search"`. Defaults to `name_only`. */
  searchVariant?: PeopleSearchVariant;
};

export type PeopleRecommendationsResult = {
  data: PeopleRec[];
  nextCursor: string | null;
  /** Populated only for `lane === "search"` with the `merged` variant. */
  suggestion: string | null;
  error: unknown;
};

export async function getPeopleRecommendations(
  options: GetPeopleRecommendationsOptions
): Promise<PeopleRecommendationsResult> {
  const {
    lane,
    q,
    roles = null,
    limit = 15,
    cursor = null,
    searchVariant = "name_only",
  } = options;

  if (lane === "search") {
    if (!q || !q.trim()) {
      return { data: [], nextCursor: null, suggestion: null, error: null };
    }
    if (searchVariant === "merged") {
      const res = await searchPeopleWithArtwork({ q, roles, limit, cursor });
      return {
        data: res.data,
        nextCursor: res.nextCursor,
        suggestion: res.suggestion,
        error: res.error,
      };
    }
    const res = await searchPeople({ q, roles, limit, cursor });
    return {
      data: res.data,
      nextCursor: res.nextCursor,
      suggestion: null,
      error: res.error,
    };
  }

  const mode: PeopleRecMode =
    lane === "follow_graph" || lane === "likes_based" || lane === "expand"
      ? lane
      : "follow_graph";

  const res = await getPeopleRecs({ mode, roles, limit, cursor });
  return {
    data: res.data,
    nextCursor: res.nextCursor,
    suggestion: null,
    error: res.error,
  };
}

export type { PeopleRec, PeopleRecMode } from "./peopleRecs";
export { ROLE_OPTIONS } from "./peopleRecs";
