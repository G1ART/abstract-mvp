import { supabase } from "./client";

export type FollowProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  main_role: string | null;
  roles: string[] | null;
  /**
   * Timestamp of the follow edge (follows.created_at). Surfaced for the
   * Network page "최신순" sort. Never null for rows returned by the
   * `getMyFollowers` / `getMyFollowing` helpers.
   */
  followed_at?: string | null;
};

const PROFILE_SELECT = "id, username, display_name, avatar_url, bio, main_role, roles";

export async function getMyFollowers(options: { limit?: number; cursor?: string } = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id)
    return { data: [], nextCursor: null, error: new Error("Not authenticated") };

  const { limit = 20, cursor } = options;
  const offset = Math.max(0, parseInt(cursor ?? "0", 10) || 0);

  const { data: rows, error } = await supabase
    .from("follows")
    .select(`follower_id, created_at, profiles!follower_id(${PROFILE_SELECT})`)
    .eq("following_id", session.user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) return { data: [], nextCursor: null, error };

  const raw = (rows ?? []) as Array<{
    follower_id: string;
    created_at: string;
    profiles: FollowProfileRow | FollowProfileRow[] | null;
  }>;
  const hasMore = raw.length > limit;
  const list = hasMore ? raw.slice(0, limit) : raw;
  const nextCursor = hasMore ? String(offset + limit) : null;

  const profiles: FollowProfileRow[] = list
    .map((r): FollowProfileRow | null => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      if (!p || typeof (p as FollowProfileRow).id !== "string") return null;
      return { ...(p as FollowProfileRow), followed_at: r.created_at ?? null };
    })
    .filter((p): p is FollowProfileRow => p !== null);

  return { data: profiles, nextCursor, error: null };
}

export async function getMyFollowing(options: { limit?: number; cursor?: string } = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id)
    return { data: [], nextCursor: null, error: new Error("Not authenticated") };

  const { limit = 20, cursor } = options;
  const offset = Math.max(0, parseInt(cursor ?? "0", 10) || 0);

  const { data: rows, error } = await supabase
    .from("follows")
    .select(`following_id, created_at, profiles!following_id(${PROFILE_SELECT})`)
    .eq("follower_id", session.user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) return { data: [], nextCursor: null, error };

  const raw = (rows ?? []) as Array<{
    following_id: string;
    created_at: string;
    profiles: FollowProfileRow | FollowProfileRow[] | null;
  }>;
  const hasMore = raw.length > limit;
  const list = hasMore ? raw.slice(0, limit) : raw;
  const nextCursor = hasMore ? String(offset + limit) : null;

  const profiles: FollowProfileRow[] = list
    .map((r): FollowProfileRow | null => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      if (!p || typeof (p as FollowProfileRow).id !== "string") return null;
      return { ...(p as FollowProfileRow), followed_at: r.created_at ?? null };
    })
    .filter((p): p is FollowProfileRow => p !== null);

  return { data: profiles, nextCursor, error: null };
}

export async function isFollowing(targetId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: false, error: null };
  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", session.user.id)
    .eq("following_id", targetId);
  return { data: (count ?? 0) > 0, error };
}

export async function follow(targetId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { error: new Error("Not authenticated") };
  return supabase.from("follows").insert({
    follower_id: session.user.id,
    following_id: targetId,
  });
}

export async function unfollow(targetId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { error: new Error("Not authenticated") };
  return supabase
    .from("follows")
    .delete()
    .eq("follower_id", session.user.id)
    .eq("following_id", targetId);
}
