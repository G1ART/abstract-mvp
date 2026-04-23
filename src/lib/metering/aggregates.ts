/**
 * Small aggregate helpers over `public.usage_events`. Used by the
 * `/dev/entitlements` and `/dev/ai-metrics` pages, and any feature panel
 * that wants to display "X used this month".
 *
 * All queries respect RLS — they only ever return counts for the
 * calling user unless explicitly passed a service-role client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/lib/supabase/client";

export type UsageCountRow = {
  event_key: string;
  count: number;
};

function sinceDate(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

export async function sumUsageThisWindow(
  userId: string,
  eventKeys: string[],
  windowDays: number,
  client: SupabaseClient = defaultClient
): Promise<number> {
  try {
    let q = client
      .from("usage_events")
      .select("value_int")
      .eq("user_id", userId)
      .in("event_key", eventKeys);
    if (windowDays > 0) q = q.gte("created_at", sinceDate(windowDays).toISOString());
    const { data, error } = await q;
    if (error || !data) return 0;
    return data.reduce((acc: number, row: { value_int?: number | null }) => acc + (row.value_int ?? 0), 0);
  } catch {
    return 0;
  }
}

export async function countUsageThisWindow(
  userId: string,
  eventKeys: string[],
  windowDays: number,
  client: SupabaseClient = defaultClient
): Promise<number> {
  try {
    let q = client
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("event_key", eventKeys);
    if (windowDays > 0) q = q.gte("created_at", sinceDate(windowDays).toISOString());
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function listUsageByEventKey(
  userId: string,
  windowDays: number,
  client: SupabaseClient = defaultClient
): Promise<UsageCountRow[]> {
  try {
    let q = client
      .from("usage_events")
      .select("event_key, value_int")
      .eq("user_id", userId);
    if (windowDays > 0) q = q.gte("created_at", sinceDate(windowDays).toISOString());
    const { data, error } = await q.limit(1000);
    if (error || !data) return [];
    const bucket = new Map<string, number>();
    for (const row of data as Array<{ event_key: string; value_int: number | null }>) {
      bucket.set(row.event_key, (bucket.get(row.event_key) ?? 0) + (row.value_int ?? 0));
    }
    return Array.from(bucket.entries())
      .map(([event_key, count]) => ({ event_key, count }))
      .sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}
