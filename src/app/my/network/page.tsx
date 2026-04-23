"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { FollowButton } from "@/components/FollowButton";
import {
  getMyFollowers,
  getMyFollowing,
  isFollowing,
  type FollowProfileRow,
} from "@/lib/supabase/follows";
import { getMyStats, type MyStats } from "@/lib/supabase/me";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";

type TabKey = "followers" | "following";
type SortKey = "recent" | "alpha";

function parseTab(raw: string | null): TabKey {
  return raw === "following" ? "following" : "followers";
}

function avatarUrl(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.startsWith("http")) return v;
  return getArtworkImageUrl(v, "avatar");
}

/**
 * Network — /my/network (Brief: Studio/Profile UX Reset + Network Page Upgrade)
 *
 * Consolidates `/my/followers` and `/my/following` into a single relationship
 * management surface with tabs, search, and sort. Existing routes remain
 * available for backward compatibility (bookmarks, deep links from old
 * notifications). Data layer is unchanged — we page through the same
 * `getMyFollowers` / `getMyFollowing` helpers.
 */
export default function MyNetworkPage() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseTab(searchParams.get("tab"));

  const [stats, setStats] = useState<MyStats | null>(null);

  const [followers, setFollowers] = useState<FollowProfileRow[]>([]);
  const [followersCursor, setFollowersCursor] = useState<string | null>(null);
  const [followersLoaded, setFollowersLoaded] = useState(false);
  const [followersLoading, setFollowersLoading] = useState(false);

  const [following, setFollowing] = useState<FollowProfileRow[]>([]);
  const [followingCursor, setFollowingCursor] = useState<string | null>(null);
  const [followingLoaded, setFollowingLoaded] = useState(false);
  const [followingLoading, setFollowingLoading] = useState(false);

  // Reverse map per person so unfollow/follow state reflects reality even in
  // the "followers" tab (where the person may or may not be someone I follow
  // back yet).
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const setTab = useCallback(
    (next: TabKey) => {
      if (next === activeTab) return;
      const params = new URLSearchParams(searchParams.toString());
      if (next === "following") params.set("tab", "following");
      else params.delete("tab");
      const qs = params.toString();
      router.replace(qs ? `/my/network?${qs}` : "/my/network", { scroll: false });
    },
    [activeTab, router, searchParams],
  );

  const hydrateFollowingMap = useCallback(async (rows: FollowProfileRow[]) => {
    if (rows.length === 0) return;
    const ids = rows.map((r) => r.id);
    const results = await Promise.all(ids.map((id) => isFollowing(id)));
    setFollowingMap((prev) => {
      const next = { ...prev };
      results.forEach((r, i) => {
        next[ids[i]] = r.data ?? false;
      });
      return next;
    });
  }, []);

  const loadFollowers = useCallback(
    async (cursor?: string) => {
      setFollowersLoading(true);
      const res = await getMyFollowers({ limit: 24, cursor });
      if (!res.error) {
        setFollowers((prev) => (cursor ? [...prev, ...res.data] : res.data));
        setFollowersCursor(res.nextCursor);
        await hydrateFollowingMap(res.data);
      }
      setFollowersLoaded(true);
      setFollowersLoading(false);
    },
    [hydrateFollowingMap],
  );

  const loadFollowing = useCallback(
    async (cursor?: string) => {
      setFollowingLoading(true);
      const res = await getMyFollowing({ limit: 24, cursor });
      if (!res.error) {
        setFollowing((prev) => (cursor ? [...prev, ...res.data] : res.data));
        setFollowingCursor(res.nextCursor);
        // Everyone in /my/following is by definition followed by me.
        setFollowingMap((prev) => {
          const next = { ...prev };
          for (const row of res.data) next[row.id] = true;
          return next;
        });
      }
      setFollowingLoaded(true);
      setFollowingLoading(false);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getMyStats();
      if (!cancelled) setStats(r.data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Lazy-load each tab the first time it is opened. Switching back to a
  // tab that's already loaded is instantaneous. The load is scheduled via
  // `requestAnimationFrame` so the effect itself does not synchronously
  // trigger a `setState` (avoids a `react-hooks/set-state-in-effect`
  // warning and matches the project-wide pattern used elsewhere).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (activeTab === "followers" && !followersLoaded && !followersLoading) {
        void loadFollowers();
      }
      if (activeTab === "following" && !followingLoaded && !followingLoading) {
        void loadFollowing();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [
    activeTab,
    followersLoaded,
    followersLoading,
    followingLoaded,
    followingLoading,
    loadFollowers,
    loadFollowing,
  ]);

  const rawRows = activeTab === "followers" ? followers : following;
  const cursor = activeTab === "followers" ? followersCursor : followingCursor;
  const loadingMore =
    activeTab === "followers"
      ? followersLoading && followers.length > 0
      : followingLoading && following.length > 0;
  const initialLoading =
    activeTab === "followers"
      ? !followersLoaded
      : !followingLoaded;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rawRows.filter((row) => {
          const name = (row.display_name ?? "").toLowerCase();
          const handle = (row.username ?? "").toLowerCase();
          const bio = (row.bio ?? "").toLowerCase();
          return (
            name.includes(q) ||
            handle.includes(q) ||
            (bio ? bio.includes(q) : false)
          );
        })
      : rawRows;
    if (sort === "alpha") {
      return [...base].sort((a, b) => {
        const an = (a.display_name ?? a.username ?? "").toLowerCase();
        const bn = (b.display_name ?? b.username ?? "").toLowerCase();
        return an.localeCompare(bn);
      });
    }
    // "recent" — follows.created_at descending (provided by follows.ts).
    // Falls back to name when timestamps are missing (should not happen
    // for rows produced by our helpers, but keeps ordering stable).
    return [...base].sort((a, b) => {
      const at = a.followed_at ? new Date(a.followed_at).getTime() : 0;
      const bt = b.followed_at ? new Date(b.followed_at).getTime() : 0;
      if (bt !== at) return bt - at;
      const an = (a.display_name ?? a.username ?? "").toLowerCase();
      const bn = (b.display_name ?? b.username ?? "").toLowerCase();
      return an.localeCompare(bn);
    });
  }, [rawRows, query, sort]);

  const followersCount = stats?.followersCount ?? 0;
  const followingCount = stats?.followingCount ?? 0;
  const visibleCount = rawRows.length;

  const hasQuery = query.trim().length > 0;
  const emptyCopy = hasQuery
    ? t("network.empty.search")
    : activeTab === "followers"
      ? t("network.empty.followers")
      : t("network.empty.following");

  return (
    <AuthGate>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/my"
          className="mb-4 inline-block text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← {t("network.backToStudio")}
        </Link>

        <header className="mb-5">
          <h1 className="text-xl font-semibold text-zinc-900">
            {t("network.title")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            <button
              type="button"
              onClick={() => setTab("followers")}
              className={`tabular-nums transition-colors ${activeTab === "followers" ? "text-zinc-900" : "hover:text-zinc-900"}`}
            >
              <span className="font-semibold">{followersCount}</span>{" "}
              {t("network.summary.followers")}
            </button>
            <span aria-hidden className="mx-2 text-zinc-300">·</span>
            <button
              type="button"
              onClick={() => setTab("following")}
              className={`tabular-nums transition-colors ${activeTab === "following" ? "text-zinc-900" : "hover:text-zinc-900"}`}
            >
              <span className="font-semibold">{followingCount}</span>{" "}
              {t("network.summary.following")}
            </button>
          </p>
        </header>

        <div
          role="tablist"
          aria-label={t("network.title")}
          data-tour="network-tabs"
          className="mb-4 inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "followers"}
            onClick={() => setTab("followers")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "followers"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {t("network.tabs.followers")}
            <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-600">
              {followersCount}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "following"}
            onClick={() => setTab("following")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "following"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {t("network.tabs.following")}
            <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-600">
              {followingCount}
            </span>
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[180px]" data-tour="network-search">
            <span className="sr-only">{t("network.search.placeholder")}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("network.search.placeholder")}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("network.search.clear")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                ✕
              </button>
            )}
          </label>
          <div
            data-tour="network-sort"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-1.5"
          >
            <span className="text-xs text-zinc-500">{t("network.sort.label")}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-transparent text-sm text-zinc-800 focus:outline-none"
            >
              <option value="recent">{t("network.sort.recent")}</option>
              <option value="alpha">{t("network.sort.alpha")}</option>
            </select>
          </div>
        </div>

        <div data-tour="network-list">
          {initialLoading ? (
            <p className="py-8 text-center text-sm text-zinc-500">…</p>
          ) : visibleCount === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/70 p-8 text-center text-sm text-zinc-500">
              {emptyCopy}
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/70 p-8 text-center text-sm text-zinc-500">
              {emptyCopy}
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
              {filtered.map((row) => {
                const src = avatarUrl(row.avatar_url);
                const name = row.display_name ?? row.username ?? "—";
                const handle = row.username ? `@${row.username}` : null;
                return (
                  <li
                    key={row.id}
                    className="flex items-center gap-3 px-4 py-3 sm:gap-4"
                  >
                    <Link
                      href={row.username ? `/u/${row.username}` : "#"}
                      className="flex min-w-0 flex-1 items-center gap-3"
                      aria-label={t("network.openProfile")}
                    >
                      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-200">
                        {src ? (
                          <Image
                            src={src}
                            alt=""
                            width={40}
                            height={40}
                            className="h-full w-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-sm font-medium text-zinc-600">
                            {name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-zinc-900">
                          {name}
                        </span>
                        {(handle || row.bio) && (
                          <span className="mt-0.5 block truncate text-xs text-zinc-500">
                            {handle}
                            {handle && row.bio && (
                              <span aria-hidden className="mx-1 text-zinc-300">·</span>
                            )}
                            {row.bio && (
                              <span className="text-zinc-500">{row.bio}</span>
                            )}
                          </span>
                        )}
                      </span>
                    </Link>
                    <FollowButton
                      targetProfileId={row.id}
                      initialFollowing={followingMap[row.id] ?? activeTab === "following"}
                      size="sm"
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {cursor && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() =>
                activeTab === "followers"
                  ? loadFollowers(cursor)
                  : loadFollowing(cursor)
              }
              disabled={loadingMore}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50"
            >
              {loadingMore ? "…" : t("network.loadMore")}
            </button>
          </div>
        )}
      </main>
    </AuthGate>
  );
}
