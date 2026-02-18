import { supabase } from "./client";
import { removeStorageFiles } from "./storage";

const BUCKET = "artworks";

export function getStorageUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export type ImageVariant = "thumb" | "medium" | "avatar" | "original";

const VARIANT_TRANSFORM: Record<
  Exclude<ImageVariant, "original">,
  { width: number; height: number; quality?: number }
> = {
  thumb: { width: 400, height: 400, quality: 70 },
  medium: { width: 1200, height: 1200, quality: 80 },
  avatar: { width: 96, height: 96, quality: 75 },
};

/** Get image URL with optional resize. thumb=feed/grid, medium=detail, avatar=profile pics. */
export function getArtworkImageUrl(
  path: string,
  variant: ImageVariant = "original"
): string {
  if (variant === "original") {
    return getStorageUrl(path);
  }
  const transform = VARIANT_TRANSFORM[variant];
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path, {
    transform: { ...transform, resize: "contain" },
  });
  return data.publicUrl;
}

export type ArtworkRow = {
  id: string;
  title: string | null;
  year: number | null;
  medium: string | null;
  story: string | null;
  pricing_mode: string | null;
  is_price_public: boolean | null;
  price_usd: number | null;
  price_input_amount: number | null;
  price_input_currency: string | null;
  fx_rate_to_usd: number | null;
  fx_date: string | null;
  ownership_status: string | null;
  artist_id: string;
  visibility: string | null;
  created_at: string | null;
  provenance_visible?: boolean | null;
};

export type ArtworkImage = { storage_path: string; sort_order?: number };
export type ArtistProfile = {
  id?: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  main_role?: string | null;
  roles?: string[] | null;
} | null;

export type ArtworkClaim = {
  id?: string;
  claim_type: string;
  subject_profile_id: string;
  artist_profile_id?: string | null;
  external_artist_id?: string | null;
  created_at?: string | null;
  profiles: { username: string | null; display_name: string | null } | null;
  external_artists?: { display_name: string; invite_email?: string | null } | null;
};

/** Base artwork shape returned from list/get with embedded images and profile. */
export type Artwork = {
  id: string;
  title: string | null;
  year: number | null;
  medium: string | null;
  size: string | null;
  story: string | null;
  visibility: string | null;
  pricing_mode: string | null;
  is_price_public: boolean | null;
  price_usd: number | null;
  price_input_amount: number | null;
  price_input_currency: string | null;
  fx_rate_to_usd: number | null;
  fx_date: string | null;
  ownership_status: string | null;
  artist_id: string;
  artist_sort_order: number | null;
  created_at: string | null;
  artwork_images: ArtworkImage[] | null;
  profiles: ArtistProfile;
  claims?: ArtworkClaim[] | null;
  provenance_visible?: boolean | null;
};

/** User can edit artwork if they are artist or lister (has claim). */
export function canEditArtwork(artwork: Artwork, userId: string | null): boolean {
  if (!userId) return false;
  if (artwork.artist_id === userId) return true;
  const claims = artwork.claims ?? [];
  return claims.some((c) => c.subject_profile_id === userId);
}

/** Get the current user's claim (for editing provenance). */
export function getMyClaim(artwork: Artwork, userId: string | null): ArtworkClaim | null {
  if (!userId) return null;
  const claims = artwork.claims ?? [];
  return claims.find((c) => c.subject_profile_id === userId) ?? null;
}

/** Pick primary claim for display (CREATED first, else first). */
export function getPrimaryClaim(artwork: Artwork): ArtworkClaim | null {
  const claims = artwork.claims ?? [];
  const created = claims.find((c) => c.claim_type === "CREATED");
  return created ?? claims[0] ?? null;
}

/** Whether the viewer can see full provenance (curator, collector, etc.). */
export function canViewProvenance(artwork: Artwork, userId: string | null): boolean {
  if (artwork.provenance_visible !== false) return true;
  if (!userId) return false;
  if (artwork.artist_id === userId) return true;
  const claims = artwork.claims ?? [];
  return claims.some((c) => c.subject_profile_id === userId);
}

/** Claims sorted for display: CREATED first, then by created_at (newest first). */
export function getProvenanceClaims(artwork: Artwork): ArtworkClaim[] {
  const claims = [...(artwork.claims ?? [])];
  const created = claims.find((c) => c.claim_type === "CREATED");
  const rest = claims.filter((c) => c.claim_type !== "CREATED");
  rest.sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bt - at;
  });
  return created ? [created, ...rest] : rest;
}

export type ArtworkWithLikes = Artwork & { likes_count: number };

type ListOptions = {
  limit?: number;
  sort?: "latest" | "popular";
};

const ARTWORK_SELECT = `
  id,
  title,
  year,
  medium,
  size,
  story,
  visibility,
  pricing_mode,
  is_price_public,
  price_usd,
  price_input_amount,
  price_input_currency,
  fx_rate_to_usd,
  fx_date,
  ownership_status,
  artist_id,
  artist_sort_order,
  created_at,
  provenance_visible,
  artwork_images(storage_path, sort_order),
  profiles!artist_id(id, username, display_name, avatar_url, bio, main_role, roles),
  artwork_likes(count),
  claims(id, claim_type, subject_profile_id, artist_profile_id, external_artist_id, created_at, profiles!subject_profile_id(username, display_name), external_artists(display_name, invite_email))
`;

export async function listPublicArtworks(
  options: ListOptions = {}
): Promise<{ data: ArtworkWithLikes[]; error: unknown }> {
  const { limit = 50, sort = "latest" } = options;

  const query = supabase
    .from("artworks")
    .select(ARTWORK_SELECT)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data, error } = await query;
  return {
    data: (data ?? []).map((r) => normalizeArtworkRow(r as Record<string, unknown>)) as ArtworkWithLikes[],
    error,
  };
}

/** Extract likes count from raw PostgREST artwork_likes shape. Always returns a number. */
export function extractLikesCount(row: Record<string, unknown> | null | undefined): number {
  const v = row?.artwork_likes;
  // PostgREST aggregated select often returns [{ count: <number|string> }]
  if (Array.isArray(v) && v.length > 0 && v[0] != null && typeof v[0] === "object" && "count" in v[0]) {
    const n = Number((v[0] as { count: unknown }).count);
    return Number.isFinite(n) ? n : 0;
  }
  // Sometimes it can return a single object
  if (v != null && typeof v === "object" && "count" in v) {
    const n = Number((v as { count: unknown }).count);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeArtworkRow(r: Record<string, unknown>): ArtworkWithLikes {
  return { ...r, likes_count: extractLikesCount(r) } as ArtworkWithLikes;
}

type FollowingOptions = {
  limit?: number;
};

export async function listFollowingArtworks(
  options: FollowingOptions = {}
): Promise<{ data: ArtworkWithLikes[]; error: unknown }> {
  const { limit = 50 } = options;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: [], error: null };

  const [followRes, claimRes] = await Promise.all([
    supabase.from("follows").select("following_id").eq("follower_id", session.user.id),
    supabase.from("claims").select("work_id").eq("subject_profile_id", session.user.id).not("work_id", "is", null),
  ]);

  const followingIds = new Set((followRes.data ?? []).map((r) => r.following_id));
  const myWorkIds = new Set((claimRes.data ?? []).map((r) => r.work_id).filter(Boolean));

  const artistIds = [...followingIds];
  const hasFollowing = artistIds.length > 0;

  let list: ArtworkWithLikes[] = [];

  if (hasFollowing) {
    const { data, error } = await supabase
      .from("artworks")
      .select(ARTWORK_SELECT)
      .eq("visibility", "public")
      .in("artist_id", artistIds)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { data: [], error };
    list = (data ?? []).map((r) => normalizeArtworkRow(r as Record<string, unknown>) as ArtworkWithLikes);
  }

  if (myWorkIds.size > 0) {
    const idsToFetch = [...myWorkIds].filter((id) => !list.some((a) => a.id === id)).slice(0, limit);
    if (idsToFetch.length > 0) {
      const { data, error } = await supabase
        .from("artworks")
        .select(ARTWORK_SELECT)
        .eq("visibility", "public")
        .in("id", idsToFetch);
      if (!error && data?.length) {
        const mine = (data ?? []).map((r) => normalizeArtworkRow(r as Record<string, unknown>) as ArtworkWithLikes);
        const seen = new Set(list.map((a) => a.id));
        for (const a of mine) {
          if (!seen.has(a.id)) {
            seen.add(a.id);
            list.push(a);
          }
        }
        list.sort(
          (a, b) =>
            new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
        );
        list = list.slice(0, limit);
      }
    }
  }

  return { data: list, error: null };
}

type MyArtworksOptions = {
  limit?: number;
};

export async function listMyArtworks(
  options: MyArtworksOptions & { publicOnly?: boolean } = {}
): Promise<{ data: ArtworkWithLikes[]; error: unknown }> {
  const { limit = 50, publicOnly = false } = options;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: [], error: null };

  let query = supabase
    .from("artworks")
    .select(ARTWORK_SELECT)
    .eq("artist_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (publicOnly) {
    query = query.eq("visibility", "public");
  }

  const { data, error } = await query;

  if (error) return { data: [], error };
  return {
    data: (data ?? []).map((r) => normalizeArtworkRow(r as Record<string, unknown>)) as ArtworkWithLikes[],
    error: null,
  };
}

type ByArtistOptions = { limit?: number };

export async function listPublicArtworksByArtistId(
  artistId: string,
  options: ByArtistOptions = {}
): Promise<{ data: ArtworkWithLikes[]; error: unknown }> {
  const { limit = 50 } = options;

  const { data, error } = await supabase
    .from("artworks")
    .select(ARTWORK_SELECT)
    .eq("artist_id", artistId)
    .eq("visibility", "public")
    .order("artist_sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { data: [], error };
  return {
    data: (data ?? []).map((r) => normalizeArtworkRow(r as Record<string, unknown>)) as ArtworkWithLikes[],
    error: null,
  };
}

/** Artworks listed by profile (collector/curator/gallerist: subject in claims). */
export async function listPublicArtworksListedByProfileId(
  profileId: string,
  options: ByArtistOptions = {}
): Promise<{ data: ArtworkWithLikes[]; error: unknown }> {
  const { limit = 50 } = options;

  const { data: claimRows } = await supabase
    .from("claims")
    .select("work_id")
    .eq("subject_profile_id", profileId)
    .not("work_id", "is", null)
    .eq("visibility", "public");

  const workIds = [...new Set((claimRows ?? []).map((r) => r.work_id).filter(Boolean))] as string[];
  if (workIds.length === 0) return { data: [], error: null };

  const { data, error } = await supabase
    .from("artworks")
    .select(ARTWORK_SELECT)
    .in("id", workIds)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { data: [], error };
  return {
    data: (data ?? []).map((r) => normalizeArtworkRow(r as Record<string, unknown>)) as ArtworkWithLikes[],
    error: null,
  };
}

/** Artworks for a profile: as artist + as lister. Used for discovery feed. */
export async function listPublicArtworksForProfile(
  profileId: string,
  options: ByArtistOptions = {}
): Promise<{ data: ArtworkWithLikes[]; error: unknown }> {
  const { limit = 6 } = options;
  const [asArtist, asLister] = await Promise.all([
    listPublicArtworksByArtistId(profileId, { limit }),
    listPublicArtworksListedByProfileId(profileId, { limit }),
  ]);
  const seen = new Set<string>();
  const merged: ArtworkWithLikes[] = [];
  const add = (a: ArtworkWithLikes) => {
    if (seen.has(a.id)) return;
    seen.add(a.id);
    merged.push(a);
  };
  (asArtist.data ?? []).forEach(add);
  (asLister.data ?? []).forEach(add);
  merged.sort(
    (a, b) =>
      new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
  return { data: merged.slice(0, limit), error: null };
}

/** Batch update artwork sort order for current user's artworks. */
export async function updateMyArtworkOrder(
  orderedIds: string[]
): Promise<{ error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id)
    return { error: new Error("Not authenticated") };
  if (orderedIds.length === 0) return { error: null };

  const items = orderedIds.map((id, idx) => ({ id, idx }));
  const errors: unknown[] = [];
  await runWithLimit(items, async ({ id, idx }) => {
    const { error } = await supabase
      .from("artworks")
      .update({
        artist_sort_order: idx,
        artist_sort_updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("artist_id", session.user.id);
    if (error) errors.push(error);
  });

  return { error: errors.length > 0 ? errors[0] : null };
}

// MVP: KRW to USD rate - replace with real rate service later
const KRW_TO_USD_RATE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_KRW_TO_USD_RATE
    ? parseFloat(process.env.NEXT_PUBLIC_KRW_TO_USD_RATE)
    : 0.00075;

export type CreateArtworkPayload = {
  title: string;
  year: number;
  medium: string;
  size: string;
  story?: string | null;
  ownership_status: string;
  pricing_mode: "fixed" | "inquire";
  is_price_public?: boolean;
  price_input_amount?: number | null;
  price_input_currency?: string | null;
  /** Override artist (for OWNS/INVENTORY; default = session user) */
  artist_id?: string | null;
};

export async function createArtwork(
  payload: CreateArtworkPayload
): Promise<{ data: string | null; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id)
    return { data: null, error: new Error("Not authenticated") };

  const today = new Date().toISOString().split("T")[0];
  let price_usd: number | null = null;
  let fx_rate_to_usd: number | null = null;
  let fx_date: string | null = null;
  let price_input_amount: number | null = null;
  let price_input_currency: string | null = null;
  let is_price_public = false;

  if (payload.pricing_mode === "fixed" && payload.price_input_amount != null) {
    price_input_amount = payload.price_input_amount;
    price_input_currency = payload.price_input_currency ?? "USD";
    is_price_public = payload.is_price_public ?? false;

    if (price_input_currency === "USD") {
      price_usd = price_input_amount;
      fx_rate_to_usd = 1;
      fx_date = today;
    } else if (price_input_currency === "KRW") {
      fx_rate_to_usd = KRW_TO_USD_RATE;
      price_usd = price_input_amount * fx_rate_to_usd;
      fx_date = today;
    }
  }

  const artistId = payload.artist_id ?? session.user.id;
  const { data, error } = await supabase
    .from("artworks")
    .insert({
      artist_id: artistId,
      title: payload.title,
      year: payload.year,
      medium: payload.medium,
      size: payload.size,
      story: payload.story ?? null,
      visibility: "public",
      ownership_status: payload.ownership_status,
      pricing_mode: payload.pricing_mode,
      is_price_public,
      price_input_amount,
      price_input_currency,
      fx_rate_to_usd,
      fx_date,
      price_usd,
    })
    .select("id")
    .single();

  if (error) return { data: null, error };
  return { data: (data as { id: string })?.id ?? null, error: null };
}

export async function getArtworkById(
  id: string
): Promise<{ data: ArtworkWithLikes | null; error: unknown }> {
  const { data, error } = await supabase
    .from("artworks")
    .select(
      `
      id,
      title,
      year,
      medium,
      size,
      story,
      visibility,
      pricing_mode,
      is_price_public,
      price_usd,
      price_input_amount,
      price_input_currency,
      fx_rate_to_usd,
      fx_date,
      ownership_status,
      artist_id,
      artist_sort_order,
      created_at,
      provenance_visible,
      artwork_images(storage_path, sort_order),
      profiles!artist_id(id, username, display_name, avatar_url, bio, main_role, roles),
      artwork_likes(count),
      claims(id, claim_type, subject_profile_id, artist_profile_id, external_artist_id, created_at, profiles!subject_profile_id(username, display_name), external_artists(display_name, invite_email))
    `
    )
    .eq("id", id)
    .single();

  if (error) return { data: null, error };
  return {
    data: data ? (normalizeArtworkRow(data as Record<string, unknown>) as ArtworkWithLikes) : null,
    error: null,
  };
}

export async function attachArtworkImage(
  artworkId: string,
  storagePath: string
) {
  return supabase.from("artwork_images").insert({
    artwork_id: artworkId,
    storage_path: storagePath,
    sort_order: 0,
  });
}

export async function deleteArtwork(artworkId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { error: new Error("Not authenticated") };
  // RLS allows delete when artist_id = auth.uid() or user has claim (lister)
  const { error } = await supabase.from("artworks").delete().eq("id", artworkId);
  return { error };
}

/** Delete artwork with cascade: storage files → artwork_images → artworks. Owner-only. */
export async function deleteArtworkCascade(
  artworkId: string
): Promise<{ error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id)
    return { error: new Error("Not authenticated") };

  const { data: artwork } = await supabase
    .from("artworks")
    .select("id, artist_id")
    .eq("id", artworkId)
    .single();

  if (!artwork || (artwork as { artist_id: string }).artist_id !== session.user.id)
    return { error: new Error("Artwork not found or not owned by you") };

  const { data: images } = await supabase
    .from("artwork_images")
    .select("storage_path")
    .eq("artwork_id", artworkId);

  const paths = (images ?? []).map((r) => (r as { storage_path: string }).storage_path);
  if (paths.length > 0) {
    const { error: storageErr } = await removeStorageFiles(paths);
    if (storageErr) {
      const isDev = process.env.NODE_ENV === "development";
      const logPayload = {
        event: "storage_delete_failed",
        artworkId,
        paths,
        error: storageErr instanceof Error ? storageErr.message : String(storageErr),
      };
      if (typeof console !== "undefined") {
        if (isDev) {
          console.warn("[deleteArtworkCascade] Storage delete failed, continuing DB cleanup. Orphan paths:", logPayload);
        } else {
          console.error("[deleteArtworkCascade] storage_delete_failed", JSON.stringify(logPayload));
        }
      }
    }
  }

  const { error: imgErr } = await supabase
    .from("artwork_images")
    .delete()
    .eq("artwork_id", artworkId);
  if (imgErr) return { error: imgErr };

  const { error } = await supabase
    .from("artworks")
    .delete()
    .eq("id", artworkId)
    .eq("artist_id", session.user.id);
  return { error };
}

const CONCURRENCY = 5;
function runWithLimit<T>(items: T[], fn: (x: T) => Promise<unknown>): Promise<void> {
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i]);
    }
  }
  const workers = Array(Math.min(CONCURRENCY, items.length)).fill(0).map(() => worker());
  return Promise.all(workers).then(() => {});
}

/** Delete multiple artworks with cascade. Owner-only, concurrency=5. */
export async function deleteArtworksBatch(
  ids: string[],
  options?: { concurrency?: number }
): Promise<{ okIds: string[]; failed: Array<{ id: string; error: unknown }> }> {
  const concurrency = options?.concurrency ?? 5;
  const okIds: string[] = [];
  const failed: Array<{ id: string; error: unknown }> = [];
  const items = ids.map((id) => ({ id }));

  await runWithLimit(items, async ({ id }) => {
    const res = await deleteArtworkCascade(id);
    if (res.error) {
      failed.push({ id, error: res.error });
    } else {
      okIds.push(id);
    }
  });

  return { okIds, failed };
}

/** Delete multiple drafts with cascade. Owner-only, batches with concurrency limit. */
export async function deleteDraftArtworks(
  ids: string[]
): Promise<{ error: unknown }> {
  if (ids.length === 0) return { error: null };
  const errors: unknown[] = [];
  await runWithLimit(ids, async (id) => {
    const res = await deleteArtworkCascade(id);
    if (res.error) errors.push(res.error);
  });
  return { error: errors.length > 0 ? errors[0] : null };
}

export type DraftArtworkPayload = {
  title: string;
};

export async function createDraftArtwork(
  payload: DraftArtworkPayload
): Promise<{ data: string | null; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id)
    return { data: null, error: new Error("Not authenticated") };

  const { data, error } = await supabase
    .from("artworks")
    .insert({
      artist_id: session.user.id,
      title: payload.title || "Untitled",
      visibility: "draft",
      ownership_status: "available",
      pricing_mode: "inquire",
      size: "",
    })
    .select("id")
    .single();

  if (error) return { data: null, error };
  return { data: (data as { id: string })?.id ?? null, error: null };
}

export type UpdateArtworkPayload = Partial<{
  title: string | null;
  year: number | null;
  medium: string | null;
  size: string | null;
  story: string | null;
  ownership_status: string | null;
  pricing_mode: "fixed" | "inquire" | null;
  is_price_public: boolean;
  price_input_amount: number | null;
  price_input_currency: string | null;
  visibility: "draft" | "public";
  artist_id: string | null;
  provenance_visible?: boolean | null;
}>;

export async function updateArtwork(
  id: string,
  partial: UpdateArtworkPayload
): Promise<{ error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id)
    return { error: new Error("Not authenticated") };

  // RLS allows update when artist or lister (has claim)
  const { error } = await supabase.from("artworks").update(partial).eq("id", id);
  return { error };
}

export async function listMyDraftArtworks(
  options: { limit?: number } = {}
): Promise<{ data: ArtworkWithLikes[]; error: unknown }> {
  const { limit = 100 } = options;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: [], error: null };

  const { data, error } = await supabase
    .from("artworks")
    .select(ARTWORK_SELECT)
    .eq("artist_id", session.user.id)
    .eq("visibility", "draft")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { data: [], error };
  return {
    data: (data ?? []).map((r) => normalizeArtworkRow(r as Record<string, unknown>)) as ArtworkWithLikes[],
    error: null,
  };
}

export function validatePublish(artwork: Artwork): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!artwork.title?.trim()) missing.push("title");
  if (!artwork.ownership_status) missing.push("ownership_status");
  if (!artwork.pricing_mode) missing.push("pricing_mode");
  const images = artwork.artwork_images ?? [];
  if (images.length < 1) missing.push("image");
  return { ok: missing.length === 0, missing };
}

export async function publishArtworks(
  ids: string[]
): Promise<{ error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id)
    return { error: new Error("Not authenticated") };
  if (ids.length === 0) return { error: null };

  const { error } = await supabase
    .from("artworks")
    .update({ visibility: "public" })
    .eq("artist_id", session.user.id)
    .in("id", ids)
    .eq("visibility", "draft");

  return { error };
}

export type PublishWithProvenanceOptions = {
  intent: "CREATED" | "OWNS" | "INVENTORY" | "CURATED";
  artistProfileId?: string | null;
  externalArtistDisplayName?: string | null;
  externalArtistEmail?: string | null;
};

export async function publishArtworksWithProvenance(
  ids: string[],
  opts: PublishWithProvenanceOptions
): Promise<{ error: unknown; inviteSent?: boolean; inviteFailed?: boolean }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id)
    return { error: new Error("Not authenticated") };
  if (ids.length === 0) return { error: null };

  const { createClaimForExistingArtist, createExternalArtistAndClaim } = await import("@/lib/provenance/rpc");

  for (const id of ids) {
    if (opts.intent === "CREATED") {
      const { error: claimErr } = await createClaimForExistingArtist({
        artistProfileId: session.user.id,
        claimType: "CREATED",
        workId: id,
        visibility: "public",
      });
      if (claimErr) return { error: claimErr };
    } else if (opts.externalArtistDisplayName) {
      const { error: claimErr } = await createExternalArtistAndClaim({
        displayName: opts.externalArtistDisplayName,
        inviteEmail: opts.externalArtistEmail ?? null,
        claimType: opts.intent,
        workId: id,
        visibility: "public",
      });
      if (claimErr) return { error: claimErr };
    } else if (opts.artistProfileId) {
      const { error: claimErr } = await createClaimForExistingArtist({
        artistProfileId: opts.artistProfileId,
        claimType: opts.intent,
        workId: id,
        visibility: "public",
      });
      if (claimErr) return { error: claimErr };
      const { error: upErr } = await supabase
        .from("artworks")
        .update({ artist_id: opts.artistProfileId })
        .eq("id", id);
      if (upErr) return { error: upErr };
    }
    const { error } = await supabase
      .from("artworks")
      .update({ visibility: "public" })
      .eq("id", id)
      .eq("visibility", "draft");
    if (error) return { error };
  }

  let inviteSent = false;
  let inviteFailed = false;
  if (opts.externalArtistEmail?.trim() && opts.externalArtistDisplayName) {
    const { sendMagicLink } = await import("@/lib/supabase/auth");
    const { error: inviteErr } = await sendMagicLink(opts.externalArtistEmail.trim());
    inviteSent = !inviteErr;
    if (inviteErr) inviteFailed = true;
  }
  return { error: null, inviteSent, inviteFailed };
}

export async function recordArtworkView(artworkId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { error: new Error("Not authenticated") };
  return supabase.from("artwork_views").insert({
    artwork_id: artworkId,
    viewer_id: session.user.id,
  });
}
