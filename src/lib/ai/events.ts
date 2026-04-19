import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiFeatureKey } from "./types";

export type AiEventRow = {
  user_id: string;
  feature_key: AiFeatureKey;
  context_size?: number | null;
  model?: string | null;
  latency_ms?: number | null;
  accepted?: boolean | null;
  error_code?: string | null;
};

/**
 * Insert a row in `ai_events` and return the new id. Never throws — when the
 * DB insert fails (network, RLS, missing table) we swallow the error so the
 * AI response is not blocked; callers treat a `null` return as "telemetry
 * unavailable for this call".
 */
export async function logAiEvent(
  supabase: SupabaseClient,
  row: AiEventRow,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("ai_events")
      .insert({
        user_id: row.user_id,
        feature_key: row.feature_key,
        context_size: row.context_size ?? null,
        model: row.model ?? null,
        latency_ms: row.latency_ms ?? null,
        accepted: row.accepted ?? null,
        error_code: row.error_code ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[ai/events] insert failed", error.message);
      return null;
    }
    return (data?.id as string | undefined) ?? null;
  } catch (err) {
    console.warn("[ai/events] insert threw", err);
    return null;
  }
}

/**
 * Flip the `accepted` column to true on an owner's own event row. Owner-RLS
 * guarantees a different user cannot mutate someone else's row. Returns
 * `true` when a row was actually updated.
 */
export async function markAiEventAccepted(
  supabase: SupabaseClient,
  userId: string,
  aiEventId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("ai_events")
      .update({ accepted: true })
      .eq("id", aiEventId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (error) return false;
    return Boolean(data?.id);
  } catch {
    return false;
  }
}
