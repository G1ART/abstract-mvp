"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";
import { logBetaEventSync } from "@/lib/beta/logEvent";
import {
  getRoomByToken,
  getRoomItemsByToken,
  logRoomAction,
  type RoomItem,
  type RoomMeta,
} from "@/lib/supabase/shortlists";

export default function RoomPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [items, setItems] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const [{ data: m, error: me }, { data: it, error: ie }] = await Promise.all([
      getRoomByToken(token),
      getRoomItemsByToken(token),
    ]);
    if (me || ie || !m) setError("This room is no longer available or the link has expired.");
    setMeta(m);
    setItems(it);
    setLoading(false);
    if (m) logBetaEventSync("room_viewed", { shortlist_id: m.id, token });
  }, [token]);

  useEffect(() => {
    const t = requestAnimationFrame(() => { void load(); });
    return () => cancelAnimationFrame(t);
  }, [load]);

  const handleArtworkClick = useCallback(
    (artworkId: string) => {
      if (meta) {
        void logRoomAction(meta.id, "opened");
        logBetaEventSync("room_opened_artwork", { shortlist_id: meta.id, artwork_id: artworkId });
      }
    },
    [meta]
  );

  const handleInquiryClick = useCallback(
    (artworkId: string) => {
      if (meta) {
        void logRoomAction(meta.id, "inquiry_clicked");
        logBetaEventSync("room_inquiry_clicked", { shortlist_id: meta.id, artwork_id: artworkId });
      }
    },
    [meta]
  );

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-center text-zinc-500">Loading...</p>
      </main>
    );
  }

  if (error || !meta) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-red-600">{error ?? "Room not found"}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-zinc-600 hover:text-zinc-900">← Home</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8 text-center">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">Private viewing room</p>
        <h1 className="text-2xl font-semibold text-zinc-900">{meta.title}</h1>
        {meta.description && <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">{meta.description}</p>}
        <p className="mt-1 text-xs text-zinc-400">
          Curated by {meta.owner_display_name ?? meta.owner_username ?? "—"}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-sm text-zinc-500">This room is empty.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.item_id} className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
              {item.artwork_id ? (
                <>
                  <Link
                    href={`/artwork/${item.artwork_id}?fromRoom=${token}`}
                    onClick={() => handleArtworkClick(item.artwork_id!)}
                  >
                    <div className="aspect-square overflow-hidden bg-zinc-100">
                      {item.artwork_image_path ? (
                        <img
                          src={getArtworkImageUrl(item.artwork_image_path, "thumb")}
                          alt={item.artwork_title ?? ""}
                          className="h-full w-full object-cover transition-transform hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-zinc-400">No image</div>
                      )}
                    </div>
                  </Link>
                  <div className="p-3">
                    <p className="truncate text-sm font-medium text-zinc-800">{item.artwork_title ?? "Untitled"}</p>
                    {item.artwork_artist_name && (
                      <p className="truncate text-xs text-zinc-500">{item.artwork_artist_name}</p>
                    )}
                    {item.note && <p className="mt-1 text-xs text-zinc-500 italic">{item.note}</p>}
                    <Link
                      href={`/artwork/${item.artwork_id}?fromRoom=${token}`}
                      onClick={() => handleInquiryClick(item.artwork_id!)}
                      className="mt-2 inline-block rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                    >
                      Ask about this work
                    </Link>
                  </div>
                </>
              ) : item.exhibition_id ? (
                <div className="p-3">
                  <Link href={`/e/${item.exhibition_id}`}>
                    <p className="text-sm font-medium text-zinc-800 hover:underline">{item.exhibition_title ?? "Exhibition"}</p>
                  </Link>
                  {item.note && <p className="mt-1 text-xs text-zinc-500 italic">{item.note}</p>}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
