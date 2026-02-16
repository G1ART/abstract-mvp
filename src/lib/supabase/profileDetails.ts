/**
 * Profile details: stored as profiles.profile_details jsonb.
 * Read from profiles, save via update_my_profile_details RPC (merge semantics).
 */

import { supabase } from "./client";
import {
  normalizeProfileDetails,
  type NormalizedDetailsPayload,
} from "@/lib/profile/normalizeProfilePayload";
import type { ProfileDetailsInput } from "@/lib/profile/sanitizeProfileDetails";

export type ProfileDetailsRow = {
  user_id: string;
  career_stage: string | null;
  age_band: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  themes: string[] | null;
  keywords: string[] | null;
  mediums: string[] | null;
  styles: string[] | null;
  collector_price_band: string | string[] | null;
  collector_acquisition_channels: string[] | null;
  affiliation: string | null;
  program_focus: string[] | null;
  updated_at?: string;
};

/** Map profile_details jsonb to ProfileDetailsRow (for Settings compatibility). */
function jsonbToDetailsRow(
  userId: string,
  json: Record<string, unknown> | null
): ProfileDetailsRow {
  if (!json || typeof json !== "object") {
    return {
      user_id: userId,
      career_stage: null,
      age_band: null,
      city: null,
      region: null,
      country: null,
      themes: null,
      keywords: null,
      mediums: null,
      styles: null,
      collector_price_band: null,
      collector_acquisition_channels: null,
      affiliation: null,
      program_focus: null,
    };
  }
  return {
    user_id: userId,
    career_stage: (json.career_stage as string) ?? null,
    age_band: (json.age_band as string) ?? null,
    city: (json.city as string) ?? null,
    region: (json.region as string) ?? null,
    country: (json.country as string) ?? null,
    themes: (json.themes as string[]) ?? null,
    keywords: (json.keywords as string[]) ?? null,
    mediums: (json.mediums as string[]) ?? null,
    styles: (json.styles as string[]) ?? null,
    collector_price_band: (() => {
      const v = json.price_band;
      if (v == null) return null;
      if (Array.isArray(v)) return v as string[];
      return [v as string];
    })(),
    collector_acquisition_channels: (json.acquisition_channels as string[]) ?? null,
    affiliation: (json.affiliation as string) ?? null,
    program_focus: (json.program_focus as string[]) ?? null,
  };
}

/** Derive ProfileDetailsRow from profile row (SSOT: profiles.profile_details jsonb). */
export function profileDetailsFromProfile(profile: {
  id?: string;
  profile_details?: Record<string, unknown> | null;
} | null): ProfileDetailsRow | null {
  if (!profile?.id) return null;
  return jsonbToDetailsRow(profile.id, profile.profile_details ?? null);
}

/** Get profile details from profiles.profile_details. Uses getMyProfile() for single SSOT. */
export async function getMyProfileDetails(): Promise<{
  data: ProfileDetailsRow | null;
  error: unknown;
}> {
  const { getMyProfile } = await import("./profiles");
  const { data, error } = await getMyProfile();
  if (error) return { data: null, error };
  const details = profileDetailsFromProfile(data as { id?: string; profile_details?: Record<string, unknown> | null } | null);
  return { data: details ?? null, error: null };
}

export type UpdateDetailsRpcResult = {
  id: string;
  username: string | null;
  profile_completeness: number | null;
  profile_details: Record<string, unknown> | null;
};

/**
 * Single source of truth for details save. Merges via RPC, returns updated row.
 * completeness: number | null — when null, RPC keeps existing value (no 0 overwrite).
 */
export async function updateMyProfileDetailsViaRpc(
  detailsJson: Record<string, unknown>,
  completeness: number | null
): Promise<{ data: UpdateDetailsRpcResult | null; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return { data: null, error: new Error("Not authenticated") };
  }

  const rpcArgs = { p_details: detailsJson, p_completeness: completeness };
  const { data, error } = await supabase.rpc("update_my_profile_details", rpcArgs);

  if (error) {
    console.error("[profileDetails] RPC failed", {
      event: "profile_save_failed",
      step: "details_rpc",
      rpc: "update_my_profile_details",
      argsKeys: Object.keys(rpcArgs),
      code: (error as { code?: string })?.code,
      message: (error as { message?: string })?.message,
    });
    return { data: null, error };
  }

  const row = Array.isArray(data) && data[0] ? (data[0] as UpdateDetailsRpcResult) : null;
  if (!row) {
    const err = new Error("RPC returned no rows");
    console.error("[profileDetails] RPC returned no rows", { event: "profile_save_failed", step: "details_rpc" });
    return { data: null, error: err };
  }
  return { data: row, error: null };
}

/** Save details via RPC (merge). Normalizes input, delegates to updateMyProfileDetailsViaRpc. */
export async function upsertMyProfileDetails(
  input: ProfileDetailsInput,
  completeness: number | null
): Promise<{ data: UpdateDetailsRpcResult | null; error: unknown }> {
  const normalized: NormalizedDetailsPayload = normalizeProfileDetails({
    career_stage: input.career_stage,
    age_band: input.age_band,
    city: input.city,
    region: input.region,
    country: input.country,
    themes: input.themes,
    mediums: input.mediums,
    styles: input.styles,
    keywords: input.keywords,
    price_band: input.price_band,
    acquisition_channels: input.acquisition_channels,
    affiliation: input.affiliation,
    program_focus: input.program_focus,
  });

  const pDetails: Record<string, unknown> = {
    career_stage: normalized.career_stage,
    age_band: normalized.age_band,
    city: normalized.city,
    region: normalized.region,
    country: normalized.country,
    themes: normalized.themes,
    keywords: normalized.keywords,
    mediums: normalized.mediums,
    styles: normalized.styles,
    price_band: normalized.price_band,
    acquisition_channels: normalized.acquisition_channels,
    affiliation: normalized.affiliation,
    program_focus: normalized.program_focus,
  };

  return updateMyProfileDetailsViaRpc(pDetails, completeness);
}

/** Save pre-built payload (e.g. compact diff). For retry or when caller builds payload. */
export async function saveProfileDetailsViaRpc(
  payload: Record<string, unknown>,
  completeness: number | null
): Promise<{ data: UpdateDetailsRpcResult | null; error: unknown }> {
  return updateMyProfileDetailsViaRpc(payload, completeness);
}

/** Details patch save: merge only changed keys. Skips if patch empty. */
export async function updateMyProfileDetails(
  patch: Record<string, unknown>,
  completeness: number | null = null
): Promise<{ data: UpdateDetailsRpcResult | null; error: unknown; skipped?: boolean }> {
  if (Object.keys(patch).length === 0) {
    return { data: null, error: null, skipped: true };
  }
  const r = await updateMyProfileDetailsViaRpc(patch, completeness);
  return { data: r.data, error: r.error };
}
