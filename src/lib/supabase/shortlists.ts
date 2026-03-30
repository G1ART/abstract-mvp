import { supabase } from "./client";

export type ShortlistRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  is_private: boolean;
  share_token: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
};

export type ShortlistItemRow = {
  id: string;
  shortlist_id: string;
  artwork_id: string | null;
  exhibition_id: string | null;
  note: string | null;
  position: number;
  created_at: string;
  artwork?: { id: string; title: string | null; artist_id: string } | null;
  exhibition?: { id: string; title: string | null } | null;
};

export type ShortlistCollaboratorRow = {
  id: string;
  shortlist_id: string;
  profile_id: string;
  role: "viewer" | "editor";
  created_at: string;
  profile?: { username: string | null; display_name: string | null } | null;
};

export type RoomItem = {
  item_id: string;
  artwork_id: string | null;
  exhibition_id: string | null;
  note: string | null;
  position: number;
  artwork_title: string | null;
  artwork_image_path: string | null;
  artwork_artist_name: string | null;
  exhibition_title: string | null;
};

export type RoomMeta = {
  id: string;
  title: string;
  description: string | null;
  owner_id: string;
  owner_username: string | null;
  owner_display_name: string | null;
};

// ── CRUD ──────────────────────────────────────────────────────

export async function createShortlist(
  title: string,
  description?: string
): Promise<{ data: ShortlistRow | null; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: null, error: new Error("Not authenticated") };
  const { data, error } = await supabase
    .from("shortlists")
    .insert({ owner_id: session.user.id, title, description: description ?? null })
    .select("*")
    .single();
  if (error) return { data: null, error };
  return { data: data as ShortlistRow, error: null };
}

export async function listMyShortlists(): Promise<{
  data: ShortlistRow[];
  error: unknown;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: [], error: null };
  const { data, error } = await supabase
    .from("shortlists")
    .select("*, shortlist_items(count)")
    .eq("owner_id", session.user.id)
    .order("updated_at", { ascending: false });
  if (error) return { data: [], error };
  const rows = (data ?? []).map((r: Record<string, unknown>) => {
    const items = r.shortlist_items;
    const count = Array.isArray(items) && items[0] && typeof items[0] === "object"
      ? (items[0] as { count: number }).count
      : 0;
    return { ...r, item_count: count } as ShortlistRow;
  });
  return { data: rows, error: null };
}

export async function getShortlist(
  id: string
): Promise<{ data: ShortlistRow | null; error: unknown }> {
  const { data, error } = await supabase
    .from("shortlists")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return { data: null, error };
  return { data: data as ShortlistRow, error: null };
}

export async function updateShortlist(
  id: string,
  fields: { title?: string; description?: string | null; is_private?: boolean }
): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from("shortlists")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  return { error };
}

export async function deleteShortlist(id: string): Promise<{ error: unknown }> {
  const { error } = await supabase.from("shortlists").delete().eq("id", id);
  return { error };
}

// ── Items ─────────────────────────────────────────────────────

export async function listShortlistItems(
  shortlistId: string
): Promise<{ data: ShortlistItemRow[]; error: unknown }> {
  const { data, error } = await supabase
    .from("shortlist_items")
    .select("*, artworks!artwork_id(id, title, artist_id), projects!exhibition_id(id, title)")
    .eq("shortlist_id", shortlistId)
    .order("position")
    .order("created_at");
  if (error) return { data: [], error };
  const rows = (data ?? []).map((r: Record<string, unknown>) => {
    const aw = r.artworks;
    const artwork = aw && typeof aw === "object" && !Array.isArray(aw) ? aw as ShortlistItemRow["artwork"] : null;
    const pr = r.projects;
    const exhibition = pr && typeof pr === "object" && !Array.isArray(pr) ? pr as ShortlistItemRow["exhibition"] : null;
    return { ...r, artwork, exhibition } as ShortlistItemRow;
  });
  return { data: rows, error: null };
}

export async function addArtworkToShortlist(
  shortlistId: string,
  artworkId: string,
  note?: string
): Promise<{ error: unknown }> {
  const { error } = await supabase.from("shortlist_items").insert({
    shortlist_id: shortlistId,
    artwork_id: artworkId,
    note: note ?? null,
  });
  if (!error) {
    await supabase
      .from("shortlists")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", shortlistId);
  }
  return { error };
}

export async function addExhibitionToShortlist(
  shortlistId: string,
  exhibitionId: string,
  note?: string
): Promise<{ error: unknown }> {
  const { error } = await supabase.from("shortlist_items").insert({
    shortlist_id: shortlistId,
    exhibition_id: exhibitionId,
    note: note ?? null,
  });
  return { error };
}

export async function removeShortlistItem(itemId: string): Promise<{ error: unknown }> {
  const { error } = await supabase.from("shortlist_items").delete().eq("id", itemId);
  return { error };
}

export async function updateShortlistItemNote(
  itemId: string,
  note: string | null
): Promise<{ error: unknown }> {
  const { error } = await supabase.from("shortlist_items").update({ note }).eq("id", itemId);
  return { error };
}

// ── Collaborators ─────────────────────────────────────────────

export async function listShortlistCollaborators(
  shortlistId: string
): Promise<{ data: ShortlistCollaboratorRow[]; error: unknown }> {
  const { data, error } = await supabase
    .from("shortlist_collaborators")
    .select("*, profiles!profile_id(username, display_name)")
    .eq("shortlist_id", shortlistId)
    .order("created_at");
  if (error) return { data: [], error };
  const rows = (data ?? []).map((r: Record<string, unknown>) => {
    const pr = r.profiles;
    const profile = pr && typeof pr === "object" && !Array.isArray(pr)
      ? pr as { username: string | null; display_name: string | null }
      : null;
    return { ...r, profile } as ShortlistCollaboratorRow;
  });
  return { data: rows, error: null };
}

export async function addCollaborator(
  shortlistId: string,
  profileId: string,
  role: "viewer" | "editor" = "viewer"
): Promise<{ error: unknown }> {
  const { error } = await supabase.from("shortlist_collaborators").insert({
    shortlist_id: shortlistId,
    profile_id: profileId,
    role,
  });
  return { error };
}

export async function removeCollaborator(collaboratorId: string): Promise<{ error: unknown }> {
  const { error } = await supabase.from("shortlist_collaborators").delete().eq("id", collaboratorId);
  return { error };
}

// ── Public room (via RPC / share_token) ───────────────────────

export async function getRoomByToken(
  token: string
): Promise<{ data: RoomMeta | null; error: unknown }> {
  const { data, error } = await supabase.rpc("get_shortlist_by_token", { p_token: token });
  if (error) return { data: null, error };
  const rows = data as RoomMeta[];
  return { data: rows?.[0] ?? null, error: null };
}

export async function getRoomItemsByToken(
  token: string
): Promise<{ data: RoomItem[]; error: unknown }> {
  const { data, error } = await supabase.rpc("get_shortlist_items_by_token", { p_token: token });
  if (error) return { data: [], error };
  return { data: (data ?? []) as RoomItem[], error: null };
}

export async function logRoomAction(
  shortlistId: string,
  action: "viewed" | "opened" | "inquiry_clicked"
): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    await supabase.from("shortlist_views").insert({
      shortlist_id: shortlistId,
      viewer_id: session?.user?.id ?? null,
      action,
    });
  } catch {
    /* best-effort */
  }
}
