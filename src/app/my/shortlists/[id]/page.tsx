"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";
import {
  getShortlist,
  listShortlistItems,
  listShortlistCollaborators,
  removeShortlistItem,
  updateShortlist,
  updateShortlistItemNote,
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

  const handleRemoveItem = useCallback(
    async (itemId: string) => {
      await removeShortlistItem(itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    },
    []
  );

  const handleNoteChange = useCallback(
    async (itemId: string, note: string) => {
      await updateShortlistItemNote(itemId, note || null);
    },
    []
  );

  const copyShareLink = useCallback(() => {
    if (!shortlist) return;
    const url = `${window.location.origin}/room/${shortlist.share_token}`;
    navigator.clipboard.writeText(url);
  }, [shortlist]);

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

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/my/shortlists" className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900">
        ← Shortlists
      </Link>

      {editingTitle ? (
        <div className="mb-6 space-y-2">
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-lg font-semibold"
          />
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            placeholder="Description / curator note..."
            rows={2}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleSaveTitle()} className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800">Save</button>
            <button type="button" onClick={() => setEditingTitle(false)} className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-zinc-900">{shortlist.title}</h1>
            <button type="button" onClick={() => setEditingTitle(true)} className="text-xs text-zinc-500 hover:text-zinc-800">Edit</button>
            <button type="button" onClick={copyShareLink} className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50">Copy share link</button>
          </div>
          {shortlist.description && <p className="mt-1 text-sm text-zinc-600">{shortlist.description}</p>}
          <p className="mt-1 text-xs text-zinc-400">{shortlist.is_private ? "Private" : "Public"} · {items.length} items · {collaborators.length} collaborators</p>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No items yet. Add artworks or exhibitions from their detail pages.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="group relative rounded-lg border border-zinc-200 bg-white p-2">
              {item.artwork_id && item.artwork ? (
                <Link href={`/artwork/${item.artwork_id}`}>
                  {item.artwork && (
                    <div className="aspect-square overflow-hidden rounded bg-zinc-100">
                      <img
                        src={getArtworkImageUrl("", "thumb")}
                        alt={item.artwork.title ?? ""}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <p className="mt-1 truncate text-sm font-medium text-zinc-800">{item.artwork.title ?? "Untitled"}</p>
                </Link>
              ) : item.exhibition_id && item.exhibition ? (
                <Link href={`/e/${item.exhibition_id}`}>
                  <p className="text-sm font-medium text-zinc-800">{item.exhibition.title ?? "Exhibition"}</p>
                </Link>
              ) : null}
              {item.note && <p className="mt-0.5 text-xs text-zinc-500">{item.note}</p>}
              <button
                type="button"
                onClick={() => void handleRemoveItem(item.id)}
                className="absolute right-1 top-1 hidden rounded bg-white/80 px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50 group-hover:block"
              >
                ×
              </button>
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
