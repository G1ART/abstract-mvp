/**
 * Single SSOT for profile save. All writes go through upsert_my_profile RPC.
 * No direct PATCH/UPDATE/INSERT to profiles table from app.
 */

import { supabase } from "./client";
import type { ProfileSaveError, ProfileSaveResult } from "./profileSaveTypes";

export type ProfileSaveUnifiedArgs = {
  basePatch: Record<string, unknown>;
  detailsPatch: Record<string, unknown>;
  completeness: number | null;
};

/** Whitelist for base. Include username only when caller explicitly sets a non-empty value (e.g. onboarding). */
const BASE_KEYS = new Set([
  "display_name",
  "bio",
  "location",
  "website",
  "avatar_url",
  "is_public",
  "main_role",
  "roles",
  "education",
  "username",
]);

/** Strip null/undefined/"" and empty []/{} so we never send education:null (prevents 23502). */
function compactPatch(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out;
}

/** Readonly fields that must never be in base patch. */
const READONLY_BASE = new Set(["id", "profile_updated_at", "profile_completeness", "profile_details"]);

function toBasePatch(raw: Record<string, unknown>): Record<string, unknown> {
  const compact = compactPatch(raw);
  if (compact.education == null) delete compact.education;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(compact)) {
    if (READONLY_BASE.has(k)) continue;
    if (BASE_KEYS.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Save base + details + completeness in one RPC. Verifies session before call.
 * Returns structured error for UI/debug; never throws on RPC failure.
 */
export async function saveProfileUnified(args: ProfileSaveUnifiedArgs): Promise<
  ProfileSaveResult<Record<string, unknown>>
> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return { ok: false, message: "Not authenticated", step: "unified_upsert" };
  }

  const p_base = toBasePatch(args.basePatch);
  const p_details = args.detailsPatch && typeof args.detailsPatch === "object" ? args.detailsPatch : {};
  const p_completeness = args.completeness ?? null;

  const { data, error } = await supabase.rpc("upsert_my_profile", {
    p_base,
    p_details,
    p_completeness,
  });

  if (error) {
    const err: ProfileSaveError = {
      ok: false,
      code: (error as { code?: string }).code,
      message: error.message,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
      step: "unified_upsert",
    };
    console.error("saveProfileUnified failed", {
      rpc: "upsert_my_profile",
      argsKeys: { base: Object.keys(p_base), details: Object.keys(p_details) },
      ...err,
    });
    return err;
  }

  if (data == null || typeof data !== "object") {
    return { ok: false, message: "RPC returned no data", step: "unified_upsert" };
  }
  return { ok: true, data: data as Record<string, unknown> };
}

/**
 * Persist profile_completeness only (base+details empty). Best-effort init for null DB completeness.
 * Call once per session per user; set sessionStorage flag to avoid loops.
 */
export async function persistCompletenessOnly(
  score: number
): Promise<ProfileSaveResult<Record<string, unknown>>> {
  return saveProfileUnified({
    basePatch: {},
    detailsPatch: {},
    completeness: score,
  });
}
