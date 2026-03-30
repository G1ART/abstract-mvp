"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";
import { logBetaEventSync } from "@/lib/beta/logEvent";
import {
  getShortlist,
  listShortlistItems,
  listShortlistCollaborators,
  removeShortlistItem,
  updateShortlist,
  addCollaborator,
  removeCollaborator,
  searchProfilesForCollab,
  rotateShareToken,
  toggleRoomActive,
  type ShortlistRow,
  type ShortlistItemRow,
  type ShortlistCollaboratorRow,
} from "@/lib/supabase/shortlists";

function ShortlistDetailContent() {
  const { t } = useT();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [shortlist, setShortlist] = useState<ShortlistRow | null>(null);
  const [items, setItems] = useState<ShortlistItemRow[]>([]);
  const [collaborators, setCollaborators] = useState<ShortlistCollaboratorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [collabSearch, setCollabSearch] = useState("");
  const [collabResults, setCollabResults] = useState<{ id: string; username: string | null; display_name: string | null }[]>([]);
  const [collabRole, setCollabRole] = useState<"viewer" | "editor">("viewer");
  const [showCollabPanel, setShowCollabPanel] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: sl }, { data: it }, { data: co }] = await Promise.all([
      getShortlist(id),
      listShortlistItems(id),
      listShortlistCollaborators(id),
    ]);
    setShortlist(sl);
    setItems(it);
    setCollaborators(co);
    if (sl) { setTitleDraft(sl.title); setDescDraft(sl.description ?? ""); }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const t = requestAnimationFrame(() => { void refresh(); });
    return () => cancelAnimationFrame(t);
  }, [refresh]);

  const handleSaveTitle = useCallback(async () => {
    if (!id || !titleDraft.trim()) return;
    await updateShortlist(id, { title: titleDraft.trim(), description: descDraft.trim() || null });
    setEditingTitle(false);
    void refresh();
  }, [id, titleDraft, descDraft, refresh]);

  const handleRemoveItem = useCallback(async (itemId: string) => {
    await removeShortlistItem(itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  const copyShareLink = useCallback(() => {
    if (!shortlist) return;
    const url = `${window.location.origin}/room/${shortlist.share_token}`;
    navigator.clipboard.writeText(url);
    logBetaEventSync("room_copy_link", { shortlist_id: id });
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [shortlist, id]);

  const handleRotateToken = useCallback(async () => {
    if (!id || !confirm("Rotate token? Old links will stop working.")) return;
    const { data: newToken } = await rotateShareToken(id);
    if (newToken) {
      setShortlist((prev) => prev ? { ...prev, share_token: newToken } : prev);
    }
  }, [id]);

  const handleToggleRoom = useCallback(async () => {
    if (!shortlist) return;
    const newVal = !(shortlist.room_active ?? true);
    await toggleRoomActive(id, newVal);
    setShortlist((prev) => prev ? { ...prev, room_active: newVal } : prev);
  }, [shortlist, id]);

  const handleCollabSearch = useCallback(async (q: string) => {
    setCollabSearch(q);
    if (q.trim().length < 2) { setCollabResults([]); return; }
    const { data } = await searchProfilesForCollab(q);
    const existingIds = new Set(collaborators.map((c) => c.profile_id));
    setCollabResults(data.filter((p) => !existingIds.has(p.id)));
  }, [collaborators]);

  const handleAddCollaborator = useCallback(async (profileId: string) => {
    const { error } = await addCollaborator(id, profileId, collabRole);
    if (!error) {
      logBetaEventSync("shortlist_collaborator_added", { shortlist_id: id, profile_id: profileId, role: collabRole });
      setCollabSearch("");
      setCollabResults([]);
      void refresh();
    }
  }, [id, collabRole, refresh]);

  const handleRemoveCollaborator = useCallback(async (collabId: string) => {
    await removeCollaborator(collabId);
    setCollaborators((prev) => prev.filter((c) => c.id !== collabId));
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-zinc-500">{t("common.loading")}</p>
      </main>
    );
  }

  if (!shortlist) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-red-600">Shortlist not found</p>
      </main>
    );
  }

  const roomActive = shortlist.room_active ?? true;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/my/shortlists" className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900">
        ← Shortlists
      </Link>

      {/* Title / Description */}
      {editingTitle ? (
        <div className="mb-6 space-y-2">
          <input type="text" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} className="w-full rounded border border-zinc-300 px-3 py-2 text-lg font-semibold" />
          <textarea value={descDraft} onChange={(e) => setDescDraft(e.target.value)} placeholder="Description / curator note..." rows={2} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleSaveTitle()} className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800">Save</button>
            <button type="button" onClick={() => setEditingTitle(false)} className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-zinc-900">{shortlist.title}</h1>
            <button type="button" onClick={() => setEditingTitle(true)} className="text-xs text-zinc-500 hover:text-zinc-800">Edit</button>
          </div>
          {shortlist.description && <p className="mt-1 text-sm text-zinc-600">{shortlist.description}</p>}
          <p className="mt-1 text-xs text-zinc-400">{shortlist.is_private ? "Private" : "Public"} · {items.length} items · {collaborators.length} collaborators</p>
        </div>
      )}

      {/* Share controls */}
      <div className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <p className="mb-2 text-xs font-medium text-zinc-500">Share & Room</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copyShareLink} className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
            {linkCopied ? "Copied!" : "Copy link"}
          </button>
          <button type="button" onClick={handleRotateToken} className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
            Rotate link
          </button>
          <button type="button" onClick={() => void handleToggleRoom()} className={`rounded border px-3 py-1.5 text-sm ${roomActive ? "border-green-300 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-700"}`}>
            Room: {roomActive ? "Active" : "Disabled"}
          </button>
        </div>
      </div>

      {/* Collaborators */}
      <div className="mb-6">
        <button type="button" onClick={() => setShowCollabPanel(!showCollabPanel)} className="mb-2 text-sm font-medium text-zinc-700 hover:text-zinc-900">
          Collaborators ({collaborators.length}) {showCollabPanel ? "▲" : "▼"}
        </button>
        {showCollabPanel && (
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex gap-2">
              <input type="text" value={collabSearch} onChange={(e) => void handleCollabSearch(e.target.value)} placeholder="Search username..." className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm" />
              <select value={collabRole} onChange={(e) => setCollabRole(e.target.value as "viewer" | "editor")} className="rounded border border-zinc-300 px-2 py-1.5 text-sm">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </div>
            {collabResults.length > 0 && (
              <ul className="mb-3 space-y-1">
                {collabResults.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded bg-zinc-50 px-3 py-1.5 text-sm">
                    <span>{p.display_name ?? p.username ?? p.id.slice(0, 8)}</span>
                    <button type="button" onClick={() => void handleAddCollaborator(p.id)} className="text-xs font-medium text-zinc-700 hover:text-zinc-900">+ Add</button>
                  </li>
                ))}
              </ul>
            )}
            {collaborators.length === 0 ? (
              <p className="text-sm text-zinc-500">No collaborators yet.</p>
            ) : (
              <ul className="space-y-1">
                {collaborators.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded px-3 py-1.5 text-sm hover:bg-zinc-50">
                    <span>
                      {c.profile?.display_name ?? c.profile?.username ?? c.profile_id.slice(0, 8)}
                      <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">{c.role}</span>
                    </span>
                    <button type="button" onClick={() => void handleRemoveCollaborator(c.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Items grid */}
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No items yet. Add artworks or exhibitions from their detail pages.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="group relative rounded-lg border border-zinc-200 bg-white p-2">
              {item.artwork_id && item.artwork ? (
                <Link href={`/artwork/${item.artwork_id}`}>
                  <div className="aspect-square overflow-hidden rounded bg-zinc-100">
                    <img src={getArtworkImageUrl("", "thumb")} alt={item.artwork.title ?? ""} className="h-full w-full object-cover" />
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-zinc-800">{item.artwork.title ?? "Untitled"}</p>
                </Link>
              ) : item.exhibition_id && item.exhibition ? (
                <Link href={`/e/${item.exhibition_id}`}>
                  <p className="text-sm font-medium text-zinc-800">{item.exhibition.title ?? "Exhibition"}</p>
                </Link>
              ) : null}
              {item.note && <p className="mt-0.5 text-xs text-zinc-500">{item.note}</p>}
              <button type="button" onClick={() => void handleRemoveItem(item.id)} className="absolute right-1 top-1 hidden rounded bg-white/80 px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50 group-hover:block">×</button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

export default function ShortlistDetailPage() {
  return (
    <AuthGate>
      <ShortlistDetailContent />
    </AuthGate>
  );
}
