/**
 * Profile CV helpers — wraps the dedicated `update_my_profile_cv` RPC and
 * provides typed read access for the CV editor at /my/profile/cv.
 *
 * The four jsonb columns (education / exhibitions / awards / residencies)
 * are loosely-typed user-authored arrays. We keep `CvEntry` as a generic
 * record so the editor can carry forward keys we haven't normalized yet
 * (a CV import flow in P6.2 may produce extra fields the human still
 * wants to keep around).
 */

import { supabase } from "./client";
import type { CvEntry } from "./profiles";

export type ProfileCvSlice = {
  education: CvEntry[];
  exhibitions: CvEntry[];
  awards: CvEntry[];
  residencies: CvEntry[];
};

const EMPTY_CV: ProfileCvSlice = {
  education: [],
  exhibitions: [],
  awards: [],
  residencies: [],
};

function asArray(v: unknown): CvEntry[] {
  if (!Array.isArray(v)) return [];
  const out: CvEntry[] = [];
  for (const item of v) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      out.push(item as CvEntry);
    }
  }
  return out;
}

/**
 * Read the current viewer's CV. Returns empty arrays for any column the
 * profile hasn't filled in. Callers should treat `error` as a soft
 * failure (the editor can still let users save fresh entries) but show
 * a banner so they know existing data may not have loaded.
 */
export async function getMyProfileCv(): Promise<{
  data: ProfileCvSlice;
  error: unknown;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return { data: EMPTY_CV, error: new Error("Not authenticated") };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("education, exhibitions, awards, residencies")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error || !data) {
    return { data: EMPTY_CV, error };
  }

  return {
    data: {
      education: asArray(data.education),
      exhibitions: asArray(data.exhibitions),
      awards: asArray(data.awards),
      residencies: asArray(data.residencies),
    },
    error: null,
  };
}

export type UpdateProfileCvPayload = Partial<ProfileCvSlice>;

/**
 * Upsert any subset of the four CV columns. Omitted keys leave that
 * column untouched (handled SQL-side via `case when ... is not null`).
 * Empty array `[]` is still a valid clear.
 */
export async function updateMyProfileCv(
  payload: UpdateProfileCvPayload,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const args: Record<string, CvEntry[] | null> = {
    p_education: null,
    p_exhibitions: null,
    p_awards: null,
    p_residencies: null,
  };
  if (payload.education !== undefined) args.p_education = payload.education ?? [];
  if (payload.exhibitions !== undefined) args.p_exhibitions = payload.exhibitions ?? [];
  if (payload.awards !== undefined) args.p_awards = payload.awards ?? [];
  if (payload.residencies !== undefined) args.p_residencies = payload.residencies ?? [];

  const { error } = await supabase.rpc("update_my_profile_cv", args);
  if (error) return { ok: false, error };
  return { ok: true };
}
