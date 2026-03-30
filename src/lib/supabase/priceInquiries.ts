import { supabase } from "./client";
import { logBetaEventSync } from "@/lib/beta/logEvent";

export type InquiryStatus = "new" | "open" | "replied" | "closed";
export type PipelineStage = "new" | "contacted" | "in_discussion" | "offer_sent" | "closed_won" | "closed_lost";

export type PriceInquiryRow = {
  id: string;
  artwork_id: string;
  inquirer_id: string;
  message: string | null;
  artist_reply: string | null;
  replied_at: string | null;
  replied_by_id?: string | null;
  created_at: string;
  inquiry_status?: InquiryStatus | null;
  last_message_at?: string | null;
  artist_unread?: boolean | null;
  inquirer_unread?: boolean | null;
  pipeline_stage?: PipelineStage | null;
  assignee_id?: string | null;
  next_action_date?: string | null;
  last_contact_date?: string | null;
  artwork?: { id: string; title: string | null; artist_id: string } | null;
  inquirer?: { username: string | null; display_name: string | null } | null;
};

export type InquiryNoteRow = {
  id: string;
  inquiry_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type PriceInquiryMessageRow = {
  id: string;
  inquiry_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

const INQUIRY_SELECT = `
  id,
  artwork_id,
  inquirer_id,
  message,
  artist_reply,
  replied_at,
  replied_by_id,
  created_at,
  inquiry_status,
  last_message_at,
  artist_unread,
  inquirer_unread,
  pipeline_stage,
  assignee_id,
  next_action_date,
  last_contact_date,
  artworks!artwork_id(id, title, artist_id),
  profiles!inquirer_id(username, display_name)
`;

/** Artist inbox list: inner join artwork so we can filter by artist_id server-side. */
const INQUIRY_LIST_SELECT = `
  id,
  artwork_id,
  inquirer_id,
  message,
  artist_reply,
  replied_at,
  replied_by_id,
  created_at,
  inquiry_status,
  last_message_at,
  artist_unread,
  inquirer_unread,
  pipeline_stage,
  assignee_id,
  next_action_date,
  last_contact_date,
  artworks!artwork_id!inner(id, title, artist_id),
  profiles!inquirer_id(username, display_name)
`;

export type InquiryListCursor = { last_message_at: string; id: string };

export type ListPriceInquiriesForArtistOptions = {
  profileId?: string;
  limit?: number;
  cursor?: InquiryListCursor | null;
  status?: InquiryStatus | "all";
  pipelineStage?: PipelineStage | "all";
  search?: string;
};

function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

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
    replied_by_id: (row.replied_by_id as string) ?? null,
    created_at: row.created_at as string,
    inquiry_status: (row.inquiry_status as InquiryStatus) ?? null,
    last_message_at: (row.last_message_at as string) ?? null,
    artist_unread: row.artist_unread as boolean | null,
    inquirer_unread: row.inquirer_unread as boolean | null,
    pipeline_stage: (row.pipeline_stage as PipelineStage) ?? null,
    assignee_id: (row.assignee_id as string) ?? null,
    next_action_date: (row.next_action_date as string) ?? null,
    last_contact_date: (row.last_contact_date as string) ?? null,
    artwork: artwork ?? null,
    inquirer: inquirer ?? null,
  };
}

/** Create a price inquiry for an artwork (caller = inquirer). */
export async function createPriceInquiry(
  artworkId: string,
  message?: string | null
): Promise<{ data: { id: string } | null; error: unknown }> {
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
  const row = data as { id: string };
  const trimmed = message?.trim();
  if (trimmed) {
    const { error: msgErr } = await supabase.from("price_inquiry_messages").insert({
      inquiry_id: row.id,
      sender_id: session.user.id,
      body: trimmed,
    });
    if (msgErr) return { data: row, error: msgErr };
  }
  logBetaEventSync("inquiry_created", { artwork_id: artworkId, inquiry_id: row.id });
  return { data: row, error: null };
}

/** Count of price inquiries on my artworks (for KPI). */
export async function getMyPriceInquiryCount(profileId?: string): Promise<{ data: number; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: 0, error: null };
  const targetId = profileId ?? session.user.id;
  const { count, error } = await supabase
    .from("price_inquiries")
    .select("id, artworks!artwork_id!inner(artist_id)", { count: "exact", head: true })
    .eq("artworks.artist_id", targetId);
  if (error) return { data: 0, error };
  return { data: count ?? 0, error: null };
}

/**
 * List inquiries on my artworks (artist / delegate acting-as).
 * Keyset on (last_message_at desc, id desc).
 */
export async function listPriceInquiriesForArtist(
  options: ListPriceInquiriesForArtistOptions = {}
): Promise<{
  data: PriceInquiryRow[];
  nextCursor: InquiryListCursor | null;
  error: unknown;
}> {
  const {
    profileId,
    limit = 25,
    cursor = null,
    status = "all",
    pipelineStage = "all",
    search = "",
  } = options;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: [], nextCursor: null, error: null };

  const targetId = profileId ?? session.user.id;
  const pageSize = Math.min(Math.max(1, limit), 50);
  const requestLimit = pageSize + 1;

  let query = supabase
    .from("price_inquiries")
    .select(INQUIRY_LIST_SELECT)
    .eq("artworks.artist_id", targetId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(requestLimit);

  if (status !== "all") {
    query = query.eq("inquiry_status", status);
  }
  if (pipelineStage !== "all") {
    query = query.eq("pipeline_stage", pipelineStage);
  }

  const q = search.trim().replace(/,/g, " ");
  if (q) {
    const pat = `%${escapeIlike(q)}%`;
    query = query.or(`artworks.title.ilike.${pat},profiles.username.ilike.${pat}`);
  }

  if (cursor?.last_message_at && cursor?.id) {
    const ts = String(cursor.last_message_at).replace(/"/g, '\\"');
    const id = String(cursor.id).replace(/"/g, '\\"');
    query = query.or(
      `last_message_at.lt."${ts}",and(last_message_at.eq."${ts}",id.lt."${id}")`
    );
  }

  const { data, error } = await query;
  if (error) return { data: [], nextCursor: null, error };

  const rows = (data ?? []) as Record<string, unknown>[];
  const normalized = rows.map(normalizeInquiry);
  const slice = normalized.length > pageSize ? normalized.slice(0, pageSize) : normalized;
  let nextCursor: InquiryListCursor | null = null;
  if (normalized.length > pageSize && slice.length > 0) {
    const last = slice[slice.length - 1];
    const lm = last.last_message_at ?? last.created_at;
    if (lm && last.id) nextCursor = { last_message_at: lm, id: last.id };
  }
  return { data: slice, nextCursor, error: null };
}

export async function listPriceInquiryMessages(
  inquiryId: string
): Promise<{ data: PriceInquiryMessageRow[]; error: unknown }> {
  const { data, error } = await supabase
    .from("price_inquiry_messages")
    .select("id, inquiry_id, sender_id, body, created_at")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: true });
  if (error) return { data: [], error };
  return { data: (data ?? []) as PriceInquiryMessageRow[], error: null };
}

export async function markPriceInquiryRead(inquiryId: string): Promise<{ error: unknown }> {
  const { error } = await supabase.rpc("mark_price_inquiry_read", {
    p_inquiry_id: inquiryId,
  });
  return { error };
}

export async function setPriceInquiryStatus(
  inquiryId: string,
  status: InquiryStatus
): Promise<{ error: unknown }> {
  const { error } = await supabase.rpc("set_price_inquiry_status", {
    p_inquiry_id: inquiryId,
    p_status: status,
  });
  return { error };
}

/** Append a thread message (inquirer or artist/delegate). */
export async function appendPriceInquiryMessage(
  inquiryId: string,
  body: string
): Promise<{ error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { error: new Error("Not authenticated") };
  const text = body.trim();
  if (!text) return { error: new Error("Empty message") };

  const { error } = await supabase.from("price_inquiry_messages").insert({
    inquiry_id: inquiryId,
    sender_id: session.user.id,
    body: text,
  });
  return { error };
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

/** Resend price_inquiry notification to artist/delegates for own unanswered inquiry (e.g. pre-patch inquiry that never notified). */
export async function resendPriceInquiryNotification(inquiryId: string): Promise<{ data: number; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: 0, error: new Error("Not authenticated") };

  const { data, error } = await supabase.rpc("resend_price_inquiry_notification", {
    p_inquiry_id: inquiryId,
  });
  if (error) return { data: 0, error };
  return { data: typeof data === "number" ? data : 0, error: null };
}

/**
 * Artist/delegate reply: inserts a thread row; DB trigger syncs legacy artist_reply / replied_at for notifications.
 */
export async function replyToPriceInquiry(inquiryId: string, reply: string): Promise<{ error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { error: new Error("Not authenticated") };

  const { error } = await supabase.from("price_inquiry_messages").insert({
    inquiry_id: inquiryId,
    sender_id: session.user.id,
    body: reply.trim() || "",
  });
  if (!error) logBetaEventSync("inquiry_replied", { inquiry_id: inquiryId });
  return { error };
}

// ── Pipeline helpers ──────────────────────────────────────────

export async function updateInquiryPipeline(
  inquiryId: string,
  fields: {
    pipeline_stage?: PipelineStage;
    assignee_id?: string;
    next_action_date?: string | null;
    last_contact_date?: string | null;
  }
): Promise<{ error: unknown }> {
  const { error } = await supabase.rpc("update_inquiry_pipeline", {
    p_inquiry_id: inquiryId,
    p_pipeline_stage: fields.pipeline_stage ?? null,
    p_assignee_id: fields.assignee_id ?? null,
    p_next_action_date: fields.next_action_date ?? null,
    p_last_contact_date: fields.last_contact_date ?? null,
  });
  return { error };
}

// ── Inquiry notes (internal, private to gallery) ──────────────

export async function listInquiryNotes(
  inquiryId: string
): Promise<{ data: InquiryNoteRow[]; error: unknown }> {
  const { data, error } = await supabase
    .from("inquiry_notes")
    .select("id, inquiry_id, author_id, body, created_at")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: true });
  if (error) return { data: [], error };
  return { data: (data ?? []) as InquiryNoteRow[], error: null };
}

export async function addInquiryNote(
  inquiryId: string,
  body: string
): Promise<{ error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { error: new Error("Not authenticated") };
  const { error } = await supabase.from("inquiry_notes").insert({
    inquiry_id: inquiryId,
    author_id: session.user.id,
    body: body.trim(),
  });
  return { error };
}
