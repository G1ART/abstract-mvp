import { supabase } from "./client";

export { getMyProfile } from "./profiles";
export { listMyArtworks } from "./artworks";

export type MyStats = {
  /** Public posts (visibility='public') */
  postsCount: number;
  /** People who follow me */
  followersCount: number;
  /** People I follow */
  followingCount: number;
  /** Total artworks (legacy, includes drafts) */
  artworksCount: number;
  viewsCount: number;
};

export async function getMyStats(): Promise<{
  data: MyStats | null;
  error: unknown;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id)
    return { data: null, error: new Error("Not authenticated") };

  const me = session.user.id;

  const [publicPostsRes, followersRes, followingRes, allArtworksRes, artworkIdsRes] = await Promise.all([
    supabase
      .from("artworks")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", me)
      .eq("visibility", "public"),
    supabase
      .from("follows")
      .select("following_id", { count: "exact", head: true })
      .eq("following_id", me),
    supabase
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("follower_id", me),
    supabase
      .from("artworks")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", me),
    supabase.from("artworks").select("id").eq("artist_id", me),
  ]);

  const postsCount = publicPostsRes.count ?? 0;
  const followersCount = followersRes.count ?? 0;
  const followingCount = followingRes.count ?? 0;
  const artworksCount = allArtworksRes.count ?? 0;

  const ids = (artworkIdsRes.data ?? []).map((r) => r.id);
  let viewsCount = 0;
  if (ids.length > 0) {
    const { count } = await supabase
      .from("artwork_views")
      .select("*", { count: "exact", head: true })
      .in("artwork_id", ids);
    viewsCount = count ?? 0;
  }

  return {
    data: { postsCount, followersCount, followingCount, artworksCount, viewsCount },
    error: null,
  };
}

/** Stats for a profile (used when acting as account delegate). RLS allows when caller is delegate of profileId. */
export async function getStatsForProfile(profileId: string): Promise<{
  data: MyStats | null;
  error: unknown;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id || !profileId)
    return { data: null, error: new Error("Not authenticated") };

  const [publicPostsRes, followersRes, followingRes, allArtworksRes, artworkIdsRes] = await Promise.all([
    supabase
      .from("artworks")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", profileId)
      .eq("visibility", "public"),
    supabase
      .from("follows")
      .select("following_id", { count: "exact", head: true })
      .eq("following_id", profileId),
    supabase
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("follower_id", profileId),
    supabase
      .from("artworks")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", profileId),
    supabase.from("artworks").select("id").eq("artist_id", profileId),
  ]);

  const postsCount = publicPostsRes.count ?? 0;
  const followersCount = followersRes.count ?? 0;
  const followingCount = followingRes.count ?? 0;
  const artworksCount = allArtworksRes.count ?? 0;

  const ids = (artworkIdsRes.data ?? []).map((r: { id: string }) => r.id);
  let viewsCount = 0;
  if (ids.length > 0) {
    const { count } = await supabase
      .from("artwork_views")
      .select("*", { count: "exact", head: true })
      .in("artwork_id", ids);
    viewsCount = count ?? 0;
  }

  return {
    data: { postsCount, followersCount, followingCount, artworksCount, viewsCount },
    error: null,
  };
}

/** Count of pending claims on my works (artist confirm/reject). Optional profileId for acting-as delegate. */
export async function getMyPendingClaimsCount(profileId?: string): Promise<{ data: number; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: 0, error: null };
  const targetId = profileId ?? session.user.id;
  const { data: workRows } = await supabase
    .from("artworks")
    .select("id")
    .eq("artist_id", targetId);
  const workIds = (workRows ?? []).map((r: { id: string }) => r.id);
  if (workIds.length === 0) return { data: 0, error: null };
  const { count, error } = await supabase
    .from("claims")
    .select("id", { count: "exact", head: true })
    .in("work_id", workIds)
    .eq("status", "pending");
  if (error) return { data: 0, error };
  return { data: count ?? 0, error: null };
}
