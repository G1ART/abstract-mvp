"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/useT";
import {
  type ArtworkWithLikes,
  listFollowingArtworks,
  listPublicArtworks,
  getStorageUrl,
} from "@/lib/supabase/artworks";
import { getFollowingIds } from "@/lib/supabase/artists";
import { getLikedArtworkIds } from "@/lib/supabase/likes";
import { getPeopleRecs, type PeopleRec } from "@/lib/supabase/peopleRecs";
import {
  ArtistThreadCard,
  type ArtistThreadArtist,
} from "./ArtistThreadCard";
import { FollowButton } from "./FollowButton";

const WORKS_PER_THREAD = 6;
const REC_CACHE_TTL_MS = 3 * 60 * 1000; // 3 min
const INTERLEAVE_EVERY = 5;
const STRONG_SCORE_THRESHOLD = 2;

type ThreadGroup = {
  artist: ArtistThreadArtist;
  artworks: ArtworkWithLikes[];
};

type FeedItem =
  | { type: "thread"; thread: ThreadGroup }
  | { type: "rec"; profile: PeopleRec };

function listToThreads(list: ArtworkWithLikes[]): ThreadGroup[] {
  const byArtist = new Map<string, ArtworkWithLikes[]>();
  for (const a of list) {
    const key = a.artist_id;
    if (!byArtist.has(key)) byArtist.set(key, []);
    byArtist.get(key)!.push(a);
  }
  const out: ThreadGroup[] = [];
  for (const [artistId, arts] of byArtist) {
    const first = arts[0];
    const profile = first?.profiles;
    out.push({
      artist: {
        id: artistId,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        bio: profile?.bio ?? null,
        roles: profile?.roles ?? null,
      },
      artworks: arts.slice(0, WORKS_PER_THREAD),
    });
  }
  return out;
}

function interleaveRecs(
  threads: ThreadGroup[],
  recCandidates: PeopleRec[]
): FeedItem[] {
  if (recCandidates.length === 0) {
    return threads.map((t) => ({ type: "thread" as const, thread: t }));
  }
  const items: FeedItem[] = [];
  let recIdx = 0;
  for (let i = 0; i < threads.length; i++) {
    items.push({ type: "thread", thread: threads[i] });
    if ((i + 1) % INTERLEAVE_EVERY === 0 && recIdx < recCandidates.length) {
      items.push({ type: "rec", profile: recCandidates[recIdx] });
      recIdx++;
    }
  }
  return items;
}

type Props = {
  tab: "all" | "following";
  sort?: "latest" | "popular";
  userId: string | null;
};

export function FeedContent({ tab, sort = "latest", userId }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [threads, setThreads] = useState<ThreadGroup[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [recCandidates, setRecCandidates] = useState<PeopleRec[]>([]);
  const recCacheRef = useRef<{
    data: PeopleRec[];
    fetchedAt: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecCandidates = useCallback(async () => {
    const now = Date.now();
    if (
      recCacheRef.current &&
      now - recCacheRef.current.fetchedAt < REC_CACHE_TTL_MS
    ) {
      return recCacheRef.current.data;
    }
    if (!userId) return [];
    const [likesRes, followRes] = await Promise.all([
      getPeopleRecs({ mode: "likes_based", limit: 10 }),
      getPeopleRecs({ mode: "follow_graph", limit: 10 }),
    ]);
    const seen = new Set<string>();
    const strong: PeopleRec[] = [];
    const add = (p: PeopleRec) => {
      if (seen.has(p.id) || p.id === userId) return;
      const mut = p.mutual_follow_sources ?? 0;
      const liked = p.liked_artists_count ?? 0;
      const tags = p.reason_tags ?? [];
      const isStrong =
        (tags.includes("follow_graph") && mut >= STRONG_SCORE_THRESHOLD) ||
        (tags.includes("likes_based") && liked >= STRONG_SCORE_THRESHOLD);
      if (isStrong) {
        seen.add(p.id);
        strong.push(p);
      }
    };
    (likesRes.data ?? []).forEach(add);
    (followRes.data ?? []).forEach(add);
    recCacheRef.current = { data: strong, fetchedAt: now };
    return strong;
  }, [userId]);

  const fetchArtworks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [artworksRes, followingRes] = await Promise.all([
      tab === "following"
        ? listFollowingArtworks({ limit: 50 })
        : listPublicArtworks({ limit: 50, sort }),
      getFollowingIds(),
    ]);
    const { data: listRaw, error: err } = artworksRes;
    setLoading(false);
    if (err) {
      const msg =
        (err as { message?: string })?.message ??
        (err as { error?: { message?: string } })?.error?.message ??
        (typeof err === "string" ? err : JSON.stringify(err));
      setError(msg);
      return;
    }
    setFollowingIds(followingRes.data ?? new Set());

    let list = listRaw ?? [];
    if (sort === "popular") {
      list = [...list].sort((a, b) => {
        const countA = Number(a.likes_count) || 0;
        const countB = Number(b.likes_count) || 0;
        if (countB !== countA) return countB - countA;
        const dateA = new Date(a.created_at ?? 0).getTime();
        const dateB = new Date(b.created_at ?? 0).getTime();
        return dateB - dateA;
      });
    }

    const groups = listToThreads(list);
    setThreads(groups);

    const allIds = list.map((a) => a.id);
    const liked = await getLikedArtworkIds(allIds);
    setLikedIds(liked);

    if (tab === "following" && userId) {
      const recs = await fetchRecCandidates();
      setRecCandidates(recs);
    } else {
      setRecCandidates([]);
    }
  }, [tab, sort, userId, fetchRecCandidates]);

  useEffect(() => {
    fetchArtworks();
  }, [fetchArtworks]);

  useEffect(() => {
    function refresh() {
      fetchArtworks();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") refresh();
    }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchArtworks]);

  const handleLikeUpdate = useCallback(
    (artworkId: string, liked: boolean, count: number) => {
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (liked) next.add(artworkId);
        else next.delete(artworkId);
        return next;
      });
      setThreads((prev) =>
        prev.map((t) => ({
          ...t,
          artworks: t.artworks.map((a) =>
            a.id === artworkId ? { ...a, likes_count: count } : a
          ),
        }))
      );
    },
    []
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <p className="text-zinc-600">{t("feed.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-600">{String(error)}</p>
      </div>
    );
  }

  const isEmpty = threads.length === 0;
  const isFollowingEmpty = tab === "following" && isEmpty;

  const feedItems: FeedItem[] =
    tab === "following" && recCandidates.length > 0
      ? interleaveRecs(threads, recCandidates)
      : threads.map((t) => ({ type: "thread", thread: t }));

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={fetchArtworks}
          className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
        >
          {t("common.refresh")}
        </button>
      </div>
      {isFollowingEmpty ? (
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <p className="text-zinc-600">{t("feed.followingEmptyTitle")}</p>
          <Link
            href="/people"
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {t("feed.followingEmptyCta")}
          </Link>
        </div>
      ) : isEmpty ? (
        <p className="py-12 text-center text-zinc-600">{t("feed.noArtworks")}</p>
      ) : (
        <div className="space-y-6">
          {feedItems.map((item, idx) => {
            if (item.type === "thread") {
              return (
                <ArtistThreadCard
                  key={`thread-${item.thread.artist.id}`}
                  artist={item.thread.artist}
                  artworks={item.thread.artworks}
                  likedIds={likedIds}
                  initialFollowing={followingIds.has(item.thread.artist.id)}
                  userId={userId}
                  onLikeUpdate={handleLikeUpdate}
                />
              );
            }
            const p = item.profile;
            const username = p.username ?? "";
            if (!username) return null;
            const tags = p.reason_tags ?? [];
            const whyKey = tags.includes("follow_graph")
              ? "feed.recommendedWhyNetwork"
              : "feed.recommendedWhyLikes";
            return (
              <article
                key={`rec-${p.id}-${idx}`}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/u/${username}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/u/${username}`);
                  }
                }}
                className="flex cursor-pointer items-center gap-4 rounded-lg border border-zinc-200 border-dashed bg-zinc-50 p-4 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-400"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-200">
                  {p.avatar_url ? (
                    <img
                      src={
                        p.avatar_url.startsWith("http")
                          ? p.avatar_url
                          : getStorageUrl(p.avatar_url)
                      }
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-medium text-zinc-500">
                      {(p.display_name ?? username).charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {t("feed.recommendedLabel")}
                  </p>
                  <p className="font-medium text-zinc-900">
                    {p.display_name ?? username}
                  </p>
                  <p className="text-sm text-zinc-500">@{username}</p>
                  {p.bio && (
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-zinc-600">
                      {p.bio}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-zinc-500">{t(whyKey)}</p>
                </div>
                {userId !== p.id && (
                  <div
                    className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <FollowButton
                      targetProfileId={p.id}
                      initialFollowing={followingIds.has(p.id)}
                      size="sm"
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
