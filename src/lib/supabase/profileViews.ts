/**
 * Profile views: record + count + viewers list.
 * Free: count only. Pro: viewers list (gated by entitlements).
 */

import { supabase } from "./client";

export async function recordProfileView(profileId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { error: new Error("Not authenticated") };
  if (session.user.id === profileId) return { error: null };
  return supabase.from("profile_views").insert({
    profile_id: profileId,
    viewer_id: session.user.id,
  });
}

export async function getProfileViewsCount(
  profileId: string,
  windowDays = 7
): Promise<{ data: number; error: unknown }> {
  const { data, error } = await supabase.rpc("get_profile_views_count", {
    p_profile_id: profileId,
    p_window_days: windowDays,
  });
  if (error) return { data: 0, error };
  return { data: (data as number) ?? 0, error: null };
}

export type ProfileViewerRow = {
  id: number;
  viewer_profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    main_role: string | null;
    roles: string[] | null;
  };
  created_at: string;
};

export function encodeViewerCursor(createdAt: string, id: number): string {
  const s = `${createdAt}|${id}`;
  if (typeof btoa !== "undefined") return btoa(s);
  return Buffer.from(s, "utf8").toString("base64");
}

export async function getProfileViewers(
  profileId: string,
  options: { limit?: number; cursor?: string | null } = {}
): Promise<{ data: ProfileViewerRow[]; nextCursor: string | null; error: unknown }> {
  const { limit = 10, cursor = null } = options;
  const { data, error } = await supabase.rpc("get_profile_viewers", {
    p_profile_id: profileId,
    p_limit: limit,
    p_cursor: cursor || null,
  });
  if (error) return { data: [], nextCursor: null, error };
  const rows = (data ?? []) as ProfileViewerRow[];
  const last = rows[rows.length - 1];
  const nextCursor =
    rows.length >= limit && last
      ? encodeViewerCursor(last.created_at, last.id)
      : null;
  return { data: rows, nextCursor, error: null };
}
