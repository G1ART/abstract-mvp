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

export async function logAiEvent(
  supabase: SupabaseClient,
  row: AiEventRow,
): Promise<void> {
  try {
    await supabase.from("ai_events").insert({
      user_id: row.user_id,
      feature_key: row.feature_key,
      context_size: row.context_size ?? null,
      model: row.model ?? null,
      latency_ms: row.latency_ms ?? null,
      accepted: row.accepted ?? null,
      error_code: row.error_code ?? null,
    });
  } catch (err) {
    // Observability must never block the response.
    // eslint-disable-next-line no-console
    console.warn("[ai/events] insert failed", err);
  }
}
