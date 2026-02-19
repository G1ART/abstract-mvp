import { supabase } from "./client";

export type PriceInquiryRow = {
  id: string;
  artwork_id: string;
  inquirer_id: string;
  message: string | null;
  artist_reply: string | null;
  replied_at: string | null;
  created_at: string;
  artwork?: { id: string; title: string | null; artist_id: string } | null;
  inquirer?: { username: string | null; display_name: string | null } | null;
};

const INQUIRY_SELECT = `
  id,
  artwork_id,
  inquirer_id,
  message,
  artist_reply,
  replied_at,
  created_at,
  artworks!artwork_id(id, title, artist_id),
  profiles!inquirer_id(username, display_name)
`;

function normalizeInquiry(row: Record<string, unknown>): PriceInquiryRow {
  const aw = row.artworks;
  const artwork = Array.isArray(aw) && aw.length > 0
    ? (aw[0] as { id: string; title: string | null; artist_id: string })
    : aw && typeof aw === "object" && !Array.isArray(aw)
      ? (aw as { id: string; title: string | null; artist_id: string })
      : null;
  const pr = row.profiles;
  const inquirer = Array.isArray(pr) && pr.length > 0
    ? (pr[0] as { username: string | null; display_name: string | null })
    : pr && typeof pr === "object" && !Array.isArray(pr)
      ? (pr as { username: string | null; display_name: string | null })
      : null;
  return {
    id: row.id as string,
    artwork_id: row.artwork_id as string,
    inquirer_id: row.inquirer_id as string,
    message: (row.message as string) ?? null,
    artist_reply: (row.artist_reply as string) ?? null,
    replied_at: (row.replied_at as string) ?? null,
    created_at: row.created_at as string,
    artwork: artwork ?? null,
    inquirer: inquirer ?? null,
  };
}

/** Create a price inquiry for an artwork (caller = inquirer). */
export async function createPriceInquiry(artworkId: string, message?: string | null): Promise<{ data: { id: string } | null; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: null, error: new Error("Not authenticated") };

  const { data, error } = await supabase
    .from("price_inquiries")
    .insert({
      artwork_id: artworkId,
      inquirer_id: session.user.id,
      message: message?.trim() || null,
    })
    .select("id")
    .single();

  if (error) return { data: null, error };
  return { data: data as { id: string }, error: null };
}

/** List inquiries on my artworks (for artist). */
export async function listPriceInquiriesForArtist(): Promise<{ data: PriceInquiryRow[]; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: [], error: null };

  const { data, error } = await supabase
    .from("price_inquiries")
    .select(INQUIRY_SELECT)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error };

  const rows = (data ?? []) as Record<string, unknown>[];
  const normalized = rows.map(normalizeInquiry);
  const forArtist = normalized.filter((r) => r.artwork?.artist_id === session.user.id);
  return { data: forArtist, error: null };
}

/** Whether the current user can reply to price inquiries for this artwork (backend: CREATED claim = artist). */
export async function canReplyToPriceInquiry(artworkId: string): Promise<{ data: boolean; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: false, error: null };

  const { data, error } = await supabase.rpc("can_reply_to_price_inquiry", {
    p_artwork_id: artworkId,
  });
  if (error) return { data: false, error };
  return { data: Boolean(data), error: null };
}

/** List price inquiries for one artwork (for artist; RLS restricts to artist). */
export async function listPriceInquiriesForArtwork(artworkId: string): Promise<{ data: PriceInquiryRow[]; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: [], error: null };

  const { data, error } = await supabase
    .from("price_inquiries")
    .select(INQUIRY_SELECT)
    .eq("artwork_id", artworkId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error };
  const rows = (data ?? []) as Record<string, unknown>[];
  return { data: rows.map((r) => normalizeInquiry(r)), error: null };
}

/** My inquiry for a single artwork (to show "Already inquired" or reply state). */
export async function getMyInquiryForArtwork(artworkId: string): Promise<{ data: PriceInquiryRow | null; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: null, error: null };

  const { data, error } = await supabase
    .from("price_inquiries")
    .select(INQUIRY_SELECT)
    .eq("artwork_id", artworkId)
    .eq("inquirer_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data: data ? normalizeInquiry(data as Record<string, unknown>) : null, error: null };
}

/** Artist replies to an inquiry. */
export async function replyToPriceInquiry(inquiryId: string, reply: string): Promise<{ error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { error: new Error("Not authenticated") };

  const { error } = await supabase
    .from("price_inquiries")
    .update({
      artist_reply: reply.trim() || null,
      replied_at: new Date().toISOString(),
    })
    .eq("id", inquiryId);

  return { error };
}
