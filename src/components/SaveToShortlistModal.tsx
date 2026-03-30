"use client";

import { useCallback, useEffect, useState } from "react";
import { logBetaEventSync } from "@/lib/beta/logEvent";
import {
  addArtworkToShortlist,
  addExhibitionToShortlist,
  createShortlist,
  listMyShortlists,
  removeArtworkFromShortlist,
  getShortlistIdsForArtwork,
  type ShortlistRow,
} from "@/lib/supabase/shortlists";

type Props = {
  artworkId?: string;
  exhibitionId?: string;
  open: boolean;
  onClose: () => void;
};

export function SaveToShortlistModal({ artworkId, exhibitionId, open, onClose }: Props) {
  const [lists, setLists] = useState<ShortlistRow[]>([]);
  const [savedIn, setSavedIn] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [{ data }] = await Promise.all([listMyShortlists()]);
    setLists(data);
    if (artworkId) {
      const { data: ids } = await getShortlistIdsForArtwork(artworkId);
      setSavedIn(new Set(ids));
    }
    setLoading(false);
  }, [artworkId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleToggle = useCallback(
    async (slId: string) => {
      setBusy(slId);
      if (savedIn.has(slId) && artworkId) {
        const { error } = await removeArtworkFromShortlist(slId, artworkId);
        if (!error) {
          setSavedIn((prev) => { const n = new Set(prev); n.delete(slId); return n; });
          logBetaEventSync("shortlist_item_removed", { shortlist_id: slId, artwork_id: artworkId });
        }
      } else {
        let error: unknown = null;
        if (artworkId) {
          ({ error } = await addArtworkToShortlist(slId, artworkId));
        } else if (exhibitionId) {
          ({ error } = await addExhibitionToShortlist(slId, exhibitionId));
        }
        if (!error) {
          setSavedIn((prev) => new Set(prev).add(slId));
          logBetaEventSync("shortlist_item_added", {
            shortlist_id: slId,
            ...(artworkId ? { artwork_id: artworkId } : { exhibition_id: exhibitionId }),
          });
        }
      }
      setBusy(null);
    },
    [artworkId, exhibitionId, savedIn]
  );

  const handleCreate = useCallback(async () => {
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    const { data: sl } = await createShortlist(title);
    if (sl) {
      setLists((prev) => [sl, ...prev]);
      if (artworkId) {
        await addArtworkToShortlist(sl.id, artworkId);
        setSavedIn((prev) => new Set(prev).add(sl.id));
        logBetaEventSync("shortlist_item_added", { shortlist_id: sl.id, artwork_id: artworkId });
      } else if (exhibitionId) {
        await addExhibitionToShortlist(sl.id, exhibitionId);
        setSavedIn((prev) => new Set(prev).add(sl.id));
        logBetaEventSync("shortlist_item_added", { shortlist_id: sl.id, exhibition_id: exhibitionId });
      }
    }
    setNewTitle("");
    setCreating(false);
  }, [newTitle, creating, artworkId, exhibitionId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">Save to shortlist</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600">×</button>
        </div>

        {loading ? (
          <p className="py-4 text-center text-sm text-zinc-500">Loading...</p>
        ) : (
          <>
            <div className="mb-3 flex gap-2">
              <input
                type="text"
                placeholder="New shortlist..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
                className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={!newTitle.trim() || creating}
                onClick={() => void handleCreate()}
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {creating ? "..." : "Create"}
              </button>
            </div>

            {lists.length === 0 ? (
              <p className="py-2 text-center text-sm text-zinc-500">No shortlists yet.</p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {lists.map((sl) => {
                  const inList = savedIn.has(sl.id);
                  return (
                    <li key={sl.id}>
                      <button
                        type="button"
                        disabled={busy === sl.id}
                        onClick={() => void handleToggle(sl.id)}
                        className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm transition ${
                          inList ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-700 hover:bg-zinc-50"
                        } disabled:opacity-50`}
                      >
                        <span className="truncate">{sl.title}</span>
                        <span className="ml-2 text-xs">
                          {busy === sl.id ? "..." : inList ? "✓ Saved" : "Add"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
