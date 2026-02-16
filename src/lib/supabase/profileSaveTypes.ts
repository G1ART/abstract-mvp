/** Structured Supabase error for profile saves (dev-friendly). */
export type ProfileSaveError = {
  ok: false;
  code?: string;
  message: string;
  details?: string;
  hint?: string;
  step: "base_update" | "details_update" | "unified_upsert";
};

export type ProfileSaveSuccess<T> = { ok: true; data: T };

export type ProfileSaveResult<T> = ProfileSaveSuccess<T> | ProfileSaveError;
