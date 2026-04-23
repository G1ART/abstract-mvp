import { supabase } from "./client";
import type { FollowProfileRow } from "./follows";

const SENDER_SELECT = "id, username, display_name, avatar_url, bio, main_role, roles";

export type ConnectionMessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
  sender: FollowProfileRow | null;
};

const MAX_BODY = 4000;

/**
 * Insert a connection message. The recipient notification row is created by
 * the `on_connection_message_notify` trigger in the
 * 20260422_connection_messages migration, so the client does not need a
 * second insert for notifications.
 */
export async function sendConnectionMessage(
  recipientId: string,
  body: string,
): Promise<{ data: { id: string } | null; error: Error | null }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return { data: null, error: new Error("Not authenticated") };
  }
  const trimmed = body.trim();
  if (!trimmed) {
    return { data: null, error: new Error("Empty message") };
  }
  if (session.user.id === recipientId) {
    return { data: null, error: new Error("Cannot message self") };
  }
  const clipped = trimmed.length > MAX_BODY ? trimmed.slice(0, MAX_BODY) : trimmed;
  const { data, error } = await supabase
    .from("connection_messages")
    .insert({
      sender_id: session.user.id,
      recipient_id: recipientId,
      body: clipped,
    })
    .select("id")
    .single();
  if (error) return { data: null, error };
  return { data: { id: data.id as string }, error: null };
}

/**
 * List connection messages where the current user is the recipient. Returns
 * newest first with cursor-based pagination (the cursor is just the offset
 * as a string — mirrors the pattern used by `getMyFollowers`).
 */
export async function listMyReceivedMessages(
  options: { limit?: number; cursor?: string } = {},
): Promise<{
  data: ConnectionMessageRow[];
  nextCursor: string | null;
  error: Error | null;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return { data: [], nextCursor: null, error: new Error("Not authenticated") };
  }

  const { limit = 20, cursor } = options;
  const offset = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);

  const { data, error } = await supabase
    .from("connection_messages")
    .select(
      `id, sender_id, recipient_id, body, read_at, created_at, sender:profiles!sender_id(${SENDER_SELECT})`,
    )
    .eq("recipient_id", session.user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) return { data: [], nextCursor: null, error };

  const raw = (data ?? []) as Array<
    Omit<ConnectionMessageRow, "sender"> & {
      sender: FollowProfileRow | FollowProfileRow[] | null;
    }
  >;
  const hasMore = raw.length > limit;
  const list = hasMore ? raw.slice(0, limit) : raw;

  const normalized: ConnectionMessageRow[] = list.map((row) => ({
    id: row.id,
    sender_id: row.sender_id,
    recipient_id: row.recipient_id,
    body: row.body,
    read_at: row.read_at,
    created_at: row.created_at,
    sender: Array.isArray(row.sender) ? row.sender[0] ?? null : row.sender,
  }));

  return {
    data: normalized,
    nextCursor: hasMore ? String(offset + limit) : null,
    error: null,
  };
}

/**
 * Flip `read_at` to now() for a message the current user received. RLS
 * guarantees the update is only allowed when `recipient_id = auth.uid()`.
 */
export async function markConnectionMessageRead(
  messageId: string,
): Promise<{ error: Error | null }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { error: new Error("Not authenticated") };
  const { error } = await supabase
    .from("connection_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", messageId)
    .is("read_at", null);
  return { error: error ?? null };
}

/**
 * Count unread messages for the current user. Used for the /my signals
 * badge. Returns 0 on failure so the badge never blocks page render.
 */
export async function getUnreadConnectionMessageCount(): Promise<number> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return 0;
  const { count, error } = await supabase
    .from("connection_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", session.user.id)
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}
