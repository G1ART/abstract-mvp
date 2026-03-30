"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import {
  createShortlist,
  deleteShortlist,
  listMyShortlists,
  type ShortlistRow,
} from "@/lib/supabase/shortlists";

function ShortlistsContent() {
  const { t } = useT();
  const [lists, setLists] = useState<ShortlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await listMyShortlists();
    setLists(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = requestAnimationFrame(() => { void refresh(); });
    return () => cancelAnimationFrame(t);
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    const { error } = await createShortlist(title);
    setCreating(false);
    if (!error) {
      setNewTitle("");
      void refresh();
    }
  }, [newTitle, creating, refresh]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this shortlist?")) return;
      await deleteShortlist(id);
      void refresh();
    },
    [refresh]
  );

  const copyShareLink = useCallback((token: string) => {
    const url = `${window.location.origin}/room/${token}`;
    navigator.clipboard.writeText(url);
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/my" className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900">
        ← {t("common.backTo")} {t("nav.myProfile")}
      </Link>
      <h1 className="mb-6 text-xl font-semibold text-zinc-900">Shortlists</h1>

      <div className="mb-6 flex gap-2">
        <input
          type="text"
          placeholder="New shortlist title..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
          className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={!newTitle.trim() || creating}
          onClick={() => void handleCreate()}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          Create
        </button>
      </div>

      {loading ? (
        <p className="text-zinc-500">{t("common.loading")}</p>
      ) : lists.length === 0 ? (
        <p className="text-zinc-600">No shortlists yet. Create one to start saving artworks.</p>
      ) : (
        <ul className="space-y-3">
          {lists.map((sl) => (
            <li key={sl.id} className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/my/shortlists/${sl.id}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {sl.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {sl.item_count ?? 0} items · {sl.is_private ? "Private" : "Public"} · {new Date(sl.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => copyShareLink(sl.share_token)}
                    className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                    title="Copy share link"
                  >
                    Share
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(sl.id)}
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function ShortlistsPage() {
  return (
    <AuthGate>
      <ShortlistsContent />
    </AuthGate>
  );
}
