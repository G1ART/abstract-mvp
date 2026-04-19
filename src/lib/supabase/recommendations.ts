/**
 * People recommendations — single contract (Track 4.3)
 *
 * Before this module, the UI code had to know about three different RPCs
 * (`get_people_recs`, `get_recommended_people`, `search_people`) and switch
 * between them based on feature flag / viewport. The new contract collapses
 * that to one function with a `lane` parameter.
 */

import type { PeopleRec, PeopleRecMode } from "./peopleRecs";
import { getPeopleRecs, searchPeople } from "./peopleRecs";

export type PeopleLane = "follow_graph" | "likes_based" | "expand" | "search";

export type GetPeopleRecommendationsOptions = {
  lane: PeopleLane;
  q?: string;
  roles?: string[] | null;
  limit?: number;
  cursor?: string | null;
};

export async function getPeopleRecommendations(
  options: GetPeopleRecommendationsOptions
): Promise<{ data: PeopleRec[]; nextCursor: string | null; error: unknown }> {
  const { lane, q, roles = null, limit = 15, cursor = null } = options;

  if (lane === "search") {
    if (!q || !q.trim()) {
      return { data: [], nextCursor: null, error: null };
    }
    return searchPeople({ q, roles, limit, cursor });
  }

  const mode: PeopleRecMode =
    lane === "follow_graph" || lane === "likes_based" || lane === "expand"
      ? lane
      : "follow_graph";

  return getPeopleRecs({ mode, roles, limit, cursor });
}
