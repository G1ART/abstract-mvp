/**
 * Profile details (profile_details table) — 1:1 with user, upsert via RPC.
 */

import { supabase } from "./client";
import { sanitizeProfileDetails, type SanitizedProfileDetails } from "@/lib/profile/sanitizeProfileDetails";
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
  collector_price_band: string | null;
  collector_acquisition_channels: string[] | null;
  affiliation: string | null;
  program_focus: string[] | null;
  updated_at: string;
};

function sanitizedToRpcPayload(s: SanitizedProfileDetails): Record<string, unknown> {
  return {
    career_stage: s.career_stage,
    age_band: s.age_band,
    city: s.city,
    region: s.region,
    country: s.country,
    themes: s.themes,
    keywords: s.keywords,
    mediums: s.mediums,
    styles: s.styles,
    collector_price_band: s.price_band,
    collector_acquisition_channels: s.acquisition_channels,
    affiliation: s.affiliation,
    program_focus: s.program_focus,
  };
}

export async function getMyProfileDetails(): Promise<{
  data: ProfileDetailsRow | null;
  error: unknown;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: null, error: null };

  const { data, error } = await supabase
    .from("profile_details")
    .select("*")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data: data as ProfileDetailsRow | null, error: null };
}

export async function upsertMyProfileDetails(input: ProfileDetailsInput): Promise<{
  data: ProfileDetailsRow | null;
  error: unknown;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return { data: null, error: new Error("Not authenticated") };
  }

  const sanitized = sanitizeProfileDetails(input);
  const payload = sanitizedToRpcPayload(sanitized);
  const p = payload as Record<string, unknown>;
  const jsonbPayload = {
    career_stage: p.career_stage ?? null,
    age_band: p.age_band ?? null,
    city: p.city ?? null,
    region: p.region ?? null,
    country: p.country ?? null,
    themes: p.themes ?? null,
    keywords: p.keywords ?? null,
    mediums: p.mediums ?? null,
    styles: p.styles ?? null,
    collector_price_band: p.collector_price_band ?? null,
    collector_acquisition_channels: p.collector_acquisition_channels ?? null,
    affiliation: p.affiliation ?? null,
    program_focus: p.program_focus ?? null,
  };

  if (process.env.NODE_ENV === "development") {
    console.warn("[profile-details] save request payload", jsonbPayload);
  }

  const { data: result, error } = await supabase.rpc("upsert_profile_details", {
    p: jsonbPayload,
  });

  if (error) return { data: null, error };
  return { data: result as ProfileDetailsRow | null, error: null };
}
