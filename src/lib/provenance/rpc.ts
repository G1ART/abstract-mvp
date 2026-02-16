/**
 * Provenance v1 RPCs.
 */

import { supabase } from "@/lib/supabase/client";
import type {
  ClaimType,
  Visibility,
  CreateExternalArtistAndClaimArgs,
  CreateClaimForExistingArtistArgs,
  SearchWorksForDedupArgs,
} from "./types";

export type CreateExternalArtistAndClaimResult = {
  external_artist: { id: string; display_name: string; [key: string]: unknown };
  claim: { id: string; [key: string]: unknown };
};

export async function createExternalArtistAndClaim(
  args: CreateExternalArtistAndClaimArgs
): Promise<{ data: CreateExternalArtistAndClaimResult | null; error: unknown }> {
  const { data, error } = await supabase.rpc("create_external_artist_and_claim", {
    p_display_name: args.displayName,
    p_website: args.website ?? null,
    p_instagram: args.instagram ?? null,
    p_invite_email: args.inviteEmail ?? null,
    p_claim_type: args.claimType,
    p_work_id: args.workId ?? null,
    p_project_id: args.projectId ?? null,
    p_visibility: (args.visibility ?? "public") as Visibility,
  });
  if (error) return { data: null, error };
  return { data: data as CreateExternalArtistAndClaimResult, error: null };
}

export type CreateClaimForExistingArtistResult = {
  claim: { id: string; [key: string]: unknown };
};

export async function createClaimForExistingArtist(
  args: CreateClaimForExistingArtistArgs
): Promise<{ data: CreateClaimForExistingArtistResult | null; error: unknown }> {
  const { data, error } = await supabase.rpc("create_claim_for_existing_artist", {
    p_artist_profile_id: args.artistProfileId,
    p_claim_type: args.claimType,
    p_work_id: args.workId ?? null,
    p_project_id: args.projectId ?? null,
    p_visibility: (args.visibility ?? "public") as Visibility,
  });
  if (error) return { data: null, error };
  return { data: data as CreateClaimForExistingArtistResult, error: null };
}

export async function searchWorksForDedup(
  args: SearchWorksForDedupArgs
): Promise<{ data: { id: string; title: string | null; [key: string]: unknown }[]; error: unknown }> {
  const { data, error } = await supabase.rpc("search_works_for_dedup", {
    p_artist_profile_id: args.artistProfileId ?? null,
    p_external_artist_id: args.externalArtistId ?? null,
    p_q: args.q ?? null,
    p_limit: args.limit ?? 20,
  });
  if (error) return { data: [], error };
  return { data: (data ?? []) as { id: string; title: string | null; [key: string]: unknown }[], error: null };
}

export function claimTypeToLabel(claimType: ClaimType, projectTitle?: string | null): string {
  switch (claimType) {
    case "CREATED":
      return "Work";
    case "OWNS":
      return "Collected";
    case "INVENTORY":
      return "Inventory";
    case "EXHIBITED":
      return "Exhibited";
    case "CURATED":
      return projectTitle ? `Curated in ${projectTitle}` : "Curated";
    case "INCLUDES_WORK":
      return projectTitle ? `In ${projectTitle}` : "Included";
    case "HOSTS_PROJECT":
      return "Hosts";
    default:
      return "Work";
  }
}
