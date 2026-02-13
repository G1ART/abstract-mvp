import { supabase } from "./client";

export { getMyProfile } from "./profiles";
export { listMyArtworks } from "./artworks";

export type MyStats = {
  artworksCount: number;
  followersCount: number;
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

  const [artworksRes, followersRes, artworkIdsRes] = await Promise.all([
    supabase
      .from("artworks")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", me),
    supabase
      .from("follows")
      .select("following_id", { count: "exact", head: true })
      .eq("following_id", me),
    supabase.from("artworks").select("id").eq("artist_id", me),
  ]);

  const artworksCount = artworksRes.count ?? 0;
  const followersCount = followersRes.count ?? 0;

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
    data: { artworksCount, followersCount, viewsCount },
    error: null,
  };
}
