"use client";

import { supabase } from "@/lib/supabase/client";

export type BetaEventName =
  | "signup_started"
  | "signup_completed"
  | "profile_completed"
  | "upload_started"
  | "upload_completed"
  | "bulk_publish_completed"
  | "artwork_liked"
  | "profile_followed"
  | "inquiry_created"
  | "inquiry_replied"
  | "exhibition_created"
  | "exhibition_artwork_added"
  | "feed_first_paint"
  | "feed_loaded"
  | "feed_load_more"
  | "shortlist_item_added"
  | "shortlist_item_removed"
  | "shortlist_collaborator_added"
  | "room_viewed"
  | "room_opened_artwork"
  | "room_inquiry_clicked"
  | "room_copy_link";

/**
 * Best-effort first-party analytics for beta (RLS: insert own user_id only).
 * Never throw; failures are silent.
 */
export async function logBetaEvent(
  eventName: BetaEventName,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id ?? null;
    await supabase.from("beta_analytics_events").insert({
      user_id: uid,
      event_name: eventName,
      payload,
      client_ts: new Date().toISOString(),
    });
  } catch {
    /* ignore */
  }
}

export function logBetaEventSync(eventName: BetaEventName, payload: Record<string, unknown> = {}): void {
  void logBetaEvent(eventName, payload);
}
