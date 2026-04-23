/**
 * Single entry point for recording usage events.
 *
 * Every quota-bearing action in the product should call `recordUsageEvent`
 * so `public.usage_events` remains the authoritative meter. Failures are
 * silent — telemetry must never break a feature path.
 *
 * Works from both client and server contexts: pass a SupabaseClient with
 * the authenticated session when calling from a route handler.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/lib/supabase/client";
import type { UsageEventPayload } from "./types";

export type RecordUsageOptions = {
  client?: SupabaseClient;
  /** When true (default), also dual-writes to `beta_analytics_events` so
   *  existing product dashboards keep seeing the event. Set false for
   *  high-volume events (e.g. feature impressions) to avoid polluting
   *  the analytics firehose. */
  dualWriteBeta?: boolean;
};

export async function recordUsageEvent(
  payload: UsageEventPayload,
  opts: RecordUsageOptions = {}
): Promise<void> {
  const client = opts.client ?? defaultClient;
  try {
    let userId = payload.userId ?? null;
    if (!userId) {
      const {
        data: { session },
      } = await client.auth.getSession();
      userId = session?.user?.id ?? null;
    }
    if (!userId) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[metering] skipped — no user session", payload.key);
      }
      return;
    }

    const row = {
      user_id: userId,
      workspace_id: payload.workspaceId ?? null,
      feature_key: payload.featureKey ?? null,
      event_key: payload.key,
      value_int: payload.valueInt ?? 1,
      metadata: payload.metadata ?? {},
      client_ts: new Date().toISOString(),
    };

    const { error } = await client.from("usage_events").insert(row);
    if (error && process.env.NODE_ENV !== "production") {
      console.warn("[metering] insert failed", error.message);
    }

    if (opts.dualWriteBeta !== false) {
      try {
        await client.from("beta_analytics_events").insert({
          user_id: userId,
          event_name: `usage.${payload.key}`,
          payload: {
            feature_key: payload.featureKey ?? null,
            value_int: payload.valueInt ?? 1,
            ...(payload.metadata ?? {}),
          },
          client_ts: new Date().toISOString(),
        });
      } catch {
        /* best-effort */
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[metering] recordUsageEvent threw", err);
    }
  }
}

export function recordUsageEventSync(
  payload: UsageEventPayload,
  opts: RecordUsageOptions = {}
): void {
  void recordUsageEvent(payload, opts);
}
