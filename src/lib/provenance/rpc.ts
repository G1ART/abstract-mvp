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

export async function createExternalArtist(
  args: { displayName: string; inviteEmail?: string | null }
): Promise<{ data: string | null; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: null, error: new Error("Not authenticated") };
  const { data, error } = await supabase
    .from("external_artists")
    .insert({
      display_name: args.displayName.trim(),
      invite_email: args.inviteEmail?.trim() || null,
      invited_by: session.user.id,
    })
    .select("id")
    .single();
  if (error) return { data: null, error };
  return { data: (data as { id: string } | null)?.id ?? null, error: null };
}

export async function updateClaim(
  claimId: string,
  payload: {
    claim_type?: string;
    artist_profile_id?: string | null;
    external_artist_id?: string | null;
    visibility?: string;
    status?: string;
  }
): Promise<{ error: unknown }> {
  const { error } = await supabase.from("claims").update(payload).eq("id", claimId);
  return { error };
}

/** Request to confirm a relationship (e.g. "I own this" / "I curated this"). Creates pending claim; artist must confirm. */
export async function createClaimRequest(args: {
  workId: string;
  claimType: ClaimType;
  artistProfileId: string;
}): Promise<{ data: { id: string } | null; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: null, error: new Error("Not authenticated") };
  const { data, error } = await supabase
    .from("claims")
    .insert({
      subject_profile_id: session.user.id,
      claim_type: args.claimType,
      work_id: args.workId,
      artist_profile_id: args.artistProfileId,
      visibility: "public",
      status: "pending",
    })
    .select("id")
    .single();
  if (error) return { data: null, error };
  return { data: data as { id: string } | null, error: null };
}

/** Artist confirms a pending claim on their work. */
export async function confirmClaim(claimId: string): Promise<{ error: unknown }> {
  const { error } = await supabase.from("claims").update({ status: "confirmed" }).eq("id", claimId);
  return { error };
}

/** Artist rejects (deletes) a pending claim on their work. */
export async function rejectClaim(claimId: string): Promise<{ error: unknown }> {
  const { error } = await supabase.from("claims").delete().eq("id", claimId);
  return { error };
}

export type PendingClaimRow = {
  id: string;
  claim_type: string;
  subject_profile_id: string;
  work_id: string | null;
  created_at: string | null;
  profiles: { username: string | null; display_name: string | null } | null;
};

/** List pending claims for a work (artist only sees these). */
export async function listPendingClaimsForWork(
  workId: string
): Promise<{ data: PendingClaimRow[]; error: unknown }> {
  const { data, error } = await supabase
    .from("claims")
    .select(
      "id, claim_type, subject_profile_id, work_id, created_at, profiles!subject_profile_id(username, display_name)"
    )
    .eq("work_id", workId)
    .eq("status", "pending");
  if (error) return { data: [], error };
  const rows: PendingClaimRow[] = (data ?? []).map((row: unknown) => {
    const r = row as Record<string, unknown>;
    const profiles = r.profiles;
    const profileObj =
      Array.isArray(profiles) && profiles.length > 0
        ? (profiles[0] as { username: string | null; display_name: string | null })
        : profiles && typeof profiles === "object" && !Array.isArray(profiles)
          ? (profiles as { username: string | null; display_name: string | null })
          : null;
    return {
      id: r.id,
      claim_type: r.claim_type,
      subject_profile_id: r.subject_profile_id,
      work_id: r.work_id ?? null,
      created_at: r.created_at ?? null,
      profiles: profileObj,
    } as PendingClaimRow;
  });
  return { data: rows, error: null };
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

/** "X by {user}" phrase for display (curated by, collected by, secured by, etc.) */
export function claimTypeToByPhrase(claimType: ClaimType): string | null {
  switch (claimType) {
    case "CREATED":
      return null; // artist is shown as "by {artist}" separately
    case "OWNS":
      return "collected by";
    case "INVENTORY":
      return "secured by";
    case "EXHIBITED":
      return "exhibited by";
    case "CURATED":
      return "curated by";
    case "INCLUDES_WORK":
      return "included by";
    case "HOSTS_PROJECT":
      return "hosted by";
    default:
      return null;
  }
}
