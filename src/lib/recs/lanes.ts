/**
 * Feed lane providers (v0: rule-based, no embeddings).
 * For You, Expand, Signals.
 */

import { supabase } from "@/lib/supabase/client";
import {
  listPublicArtworks,
  listFollowingArtworks,
  type ArtworkWithLikes,
} from "@/lib/supabase/artworks";

const CANDIDATE_POOL = 200;
const DEFAULT_LIMIT = 20;

async function hasTasteEmbedding(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_taste_profiles")
    .select("taste_embedding")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { taste_embedding?: unknown } | null;
  return Array.isArray(row?.taste_embedding) && row.taste_embedding.length > 0;
}

function mixPopularAndLatest(artworks: ArtworkWithLikes[]): ArtworkWithLikes[] {
  const byPopular = [...artworks].sort((a, b) => {
    const la = Number(a.likes_count) || 0;
    const lb = Number(b.likes_count) || 0;
    if (lb !== la) return lb - la;
    return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
  });
  const byLatest = [...artworks].sort((a, b) =>
    new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
  const seen = new Set<string>();
  const out: ArtworkWithLikes[] = [];
  for (let i = 0; i < Math.max(byPopular.length, byLatest.length); i++) {
    if (byLatest[i] && !seen.has(byLatest[i].id)) {
      seen.add(byLatest[i].id);
      out.push(byLatest[i]);
    }
    if (byPopular[i] && !seen.has(byPopular[i].id)) {
      seen.add(byPopular[i].id);
      out.push(byPopular[i]);
    }
  }
  return out;
}

export type LaneResult = {
  data: ArtworkWithLikes[];
  nextCursor: string | null;
  error: unknown;
};

export async function getForYou({
  userId,
  limit = DEFAULT_LIMIT,
}: {
  userId: string | null;
  limit?: number;
  cursor?: string | null;
}): Promise<LaneResult> {
  const hasTaste = userId ? await hasTasteEmbedding(userId) : false;

  if (hasTaste) {
    const { data, error } = await listPublicArtworks({
      limit: Math.min(CANDIDATE_POOL, limit * 3),
      sort: "latest",
    });
    if (error) return { data: [], nextCursor: null, error };
    const list = data ?? [];
    const mixed = mixPopularAndLatest(list);
    return {
      data: mixed.slice(0, limit),
      nextCursor: mixed.length > limit ? "more" : null,
      error: null,
    };
  }

  const { data, error } = await listPublicArtworks({
    limit: Math.min(CANDIDATE_POOL, limit * 2),
    sort: "popular",
  });
  if (error) return { data: [], nextCursor: null, error };
  let list = data ?? [];
  list = mixPopularAndLatest(list);
  return {
    data: list.slice(0, limit),
    nextCursor: list.length > limit ? "more" : null,
    error: null,
  };
}

export async function getExpand({
  userId,
  limit = DEFAULT_LIMIT,
}: {
  userId: string | null;
  limit?: number;
}): Promise<LaneResult> {
  const forYouRes = await getForYou({ userId, limit: 30 });
  const forYou = forYouRes.data ?? [];
  const topArtistIds = new Set(forYou.slice(0, 10).map((a) => a.artist_id));

  const { data, error } = await listPublicArtworks({
    limit: CANDIDATE_POOL,
    sort: "latest",
  });
  if (error) return { data: [], nextCursor: null, error };
  let list = data ?? [];
  const diversified = list.filter((a) => !topArtistIds.has(a.artist_id));
  const rest = list.filter((a) => topArtistIds.has(a.artist_id));
  const combined = [...diversified, ...rest];
  const seen = new Set<string>();
  const out: ArtworkWithLikes[] = [];
  for (const a of combined) {
    if (!seen.has(a.id) && out.length < limit) {
      seen.add(a.id);
      out.push(a);
    }
  }
  return {
    data: out,
    nextCursor: combined.length > limit ? "more" : null,
    error: null,
  };
}

export async function getSignals({
  userId,
  limit = DEFAULT_LIMIT,
}: {
  userId: string | null;
  limit?: number;
}): Promise<LaneResult> {
  const { data, error } = await listFollowingArtworks({
    limit: Math.max(limit, 50),
  });
  if (error) return { data: [], nextCursor: null, error };
  const list = data ?? [];
  return {
    data: list.slice(0, limit),
    nextCursor: list.length > limit ? "more" : null,
    error: null,
  };
}
