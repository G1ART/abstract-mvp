"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/useT";
import { getSession } from "@/lib/supabase/auth";
import { getFollowingIds } from "@/lib/supabase/artists";
import {
  getPeopleRecs,
  searchPeople,
  ROLE_OPTIONS,
  type PeopleRec,
  type PeopleRecMode,
} from "@/lib/supabase/peopleRecs";
import { getStorageUrl } from "@/lib/supabase/artworks";
import { AuthGate } from "@/components/AuthGate";
import { FollowButton } from "@/components/FollowButton";

const DEBOUNCE_MS = 250;
const INITIAL_LIMIT = 15;
const LOAD_MORE_LIMIT = 10;

type LaneKey = "follow" | "likes" | "expand";
const LANE_TO_MODE: Record<LaneKey, PeopleRecMode> = {
  follow: "follow_graph",
  likes: "likes_based",
  expand: "expand",
};

function formatReasonLine(profile: PeopleRec, t: (key: string) => string): string {
  const tags = profile.reason_tags ?? [];
  const parts: string[] = [];
  for (const tag of tags) {
    if (tag === "follow_graph") parts.push(t("people.reason.followGraph"));
    else if (tag === "likes_based") parts.push(t("people.reason.likesBased"));
    else if (tag === "expand") parts.push(t("people.reason.expand"));
    else if (tag === "shared_themes" && profile.reason_detail?.sharedThemesTop) {
      parts.push(
        `${t("people.reason.sharedThemes")}: ${(profile.reason_detail.sharedThemesTop as string[]).join(", ")}`
      );
    } else if (tag === "shared_school" && profile.reason_detail?.sharedSchool) {
      parts.push(
        `${t("people.reason.sharedSchool")}: ${profile.reason_detail.sharedSchool as string}`
      );
    } else if (tag === "role_match") parts.push(t("people.reason.roleMatch"));
    else if (tag === "same_city") parts.push(t("people.reason.sameCity"));
    else if (tag === "shared_medium") parts.push(t("people.reason.sharedMedium"));
  }
  return parts.join(" · ");
}

function getScoreBadge(profile: PeopleRec, t: (key: string) => string): string | null {
  const mut = profile.mutual_follow_sources ?? 0;
  const liked = profile.liked_artists_count ?? 0;
  const tags = profile.reason_tags ?? [];
  if (tags.includes("follow_graph") && mut >= 2) {
    return `${mut} ${t("people.reason.followGraph")}`;
  }
  if (tags.includes("likes_based") && liked >= 2) {
    return `${liked} signals`;
  }
  return null;
}

export function PeopleClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useT();

  const qFromUrl = searchParams.get("q") ?? "";
  const laneFromUrl = (searchParams.get("lane") as LaneKey) ?? "follow";
  const validLane = ["follow", "likes", "expand"].includes(laneFromUrl)
    ? laneFromUrl
    : "follow";
  const rolesFromUrl = searchParams.get("roles") ?? "";
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState(qFromUrl);
  const [debouncedSearch, setDebouncedSearch] = useState(qFromUrl);
  const [lane, setLane] = useState<LaneKey>(validLane);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(() => {
    if (!rolesFromUrl) return new Set();
    return new Set(
      rolesFromUrl
        .split(",")
        .filter((x) => ROLE_OPTIONS.includes(x as (typeof ROLE_OPTIONS)[number]))
    );
  });
  const isSearchMode = !!debouncedSearch.trim();

  const [profiles, setProfiles] = useState<PeopleRec[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateUrl = useCallback(
    (opts: { q?: string; roles?: Set<string>; lane?: LaneKey }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (opts.q !== undefined) {
        const v = opts.q.trim();
        if (v) params.set("q", v);
        else params.delete("q");
      }
      if (opts.roles !== undefined) {
        if (opts.roles.size > 0)
          params.set("roles", Array.from(opts.roles).sort().join(","));
        else params.delete("roles");
      }
      if (opts.lane !== undefined) {
        if (opts.lane !== "follow") params.set("lane", opts.lane);
        else params.delete("lane");
      }
      const s = params.toString();
      router.replace(s ? `/people?${s}` : "/people", { scroll: false });
    },
    [router, searchParams]
  );

  useEffect(() => {
    getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    const tid = setTimeout(() => setDebouncedSearch(search), DEBOUNCE_MS);
    return () => clearTimeout(tid);
  }, [search]);

  useEffect(() => {
    if (debouncedSearch.trim()) {
      updateUrl({ q: debouncedSearch });
    } else {
      updateUrl({ q: "", lane });
    }
  }, [debouncedSearch]);

  const rolesArr = selectedRoles.size > 0 ? Array.from(selectedRoles) : [];

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProfiles([]);
    setNextCursor(null);

    try {
      const [followingRes] = await Promise.all([getFollowingIds()]);
      setFollowingIds(followingRes.data);

      if (isSearchMode) {
        if (!debouncedSearch.trim()) {
          setLoading(false);
          return;
        }
        const res = await searchPeople({
          q: debouncedSearch.trim(),
          roles: rolesArr,
          limit: INITIAL_LIMIT,
          cursor: null,
        });
        if (res.error) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[People] searchPeople RPC error:", res.error);
          }
          setError(t("people.loadFailed"));
          return;
        }
        setProfiles(res.data ?? []);
        setNextCursor(res.nextCursor ?? null);
      } else {
        const mode = LANE_TO_MODE[lane];
        const res = await getPeopleRecs({
          mode,
          roles: rolesArr,
          limit: INITIAL_LIMIT,
          cursor: null,
        });
        if (res.error) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[People] getPeopleRecs RPC error:", res.error);
          }
          setError(t("people.loadFailed"));
          return;
        }
        setProfiles(res.data ?? []);
        setNextCursor(res.nextCursor ?? null);
      }
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[People] fetch error:", err);
      }
      setError(t("people.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [isSearchMode, lane, debouncedSearch, rolesArr.join(","), t]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      if (isSearchMode) {
        const res = await searchPeople({
          q: debouncedSearch.trim(),
          roles: rolesArr,
          limit: LOAD_MORE_LIMIT,
          cursor: nextCursor,
        });
        if (res.error) return;
        setProfiles((prev) => [...prev, ...res.data]);
        setNextCursor(res.nextCursor);
      } else {
        const mode = LANE_TO_MODE[lane];
        const res = await getPeopleRecs({
          mode,
          roles: rolesArr,
          limit: LOAD_MORE_LIMIT,
          cursor: nextCursor,
        });
        if (res.error) return;
        setProfiles((prev) => [...prev, ...res.data]);
        setNextCursor(res.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [isSearchMode, lane, debouncedSearch, rolesArr.join(","), nextCursor, loadingMore]);

  function setLaneAndUpdate(l: LaneKey) {
    setLane(l);
    updateUrl({ lane: l });
  }

  function toggleRole(role: string) {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      updateUrl({ roles: next });
      return next;
    });
  }

  function clearRoles() {
    setSelectedRoles(new Set());
    updateUrl({ roles: new Set() });
  }

  function handleCardClick(username: string) {
    router.push(`/u/${username}`);
  }

  const emptyRecommendations =
    !loading && !isSearchMode && profiles.length === 0;
  const emptySearch = !loading && isSearchMode && profiles.length === 0;

  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold">{t("people.title")}</h1>

        <input
          ref={searchInputRef}
          type="search"
          placeholder={t("people.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full rounded border border-zinc-300 px-3 py-2"
        />

        {!isSearchMode && (
          <div className="mb-4 flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {(["follow", "likes", "expand"] as LaneKey[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLaneAndUpdate(l)}
                  className={`rounded-lg px-3 py-2 text-left text-sm font-medium ${
                    lane === l
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }`}
                >
                  {l === "follow" && t("people.lanes.followGraphTitle")}
                  {l === "likes" && t("people.lanes.likesBasedTitle")}
                  {l === "expand" && t("people.lanes.expandTitle")}
                </button>
              ))}
            </div>
            {lane === "follow" && (
              <p className="text-xs text-zinc-500">
                {t("people.lanes.followGraphSubtitle")}
              </p>
            )}
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-500">{t("people.filtersLabel")}:</span>
          {ROLE_OPTIONS.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => toggleRole(role)}
              className={`rounded-full px-3 py-1 text-sm ${
                selectedRoles.has(role)
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
              }`}
            >
              {t(`people.role.${role}`)}
            </button>
          ))}
          {selectedRoles.size > 0 && (
            <button
              type="button"
              onClick={clearRoles}
              className="rounded-full px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              {t("people.filterAll")}
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-zinc-600">{t("people.loading")}</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : emptyRecommendations ? (
          <div className="py-12 text-center">
            <p className="mb-4 text-zinc-600">{t("people.noRecommendations")}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => searchInputRef.current?.focus()}
                className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {t("people.trySearch")}
              </button>
              <a
                href="/onboarding"
                className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {t("people.completeProfile")}
              </a>
            </div>
          </div>
        ) : emptySearch ? (
          <div className="py-12 text-center">
            <p className="mb-4 text-zinc-600">{t("people.noSearchResults")}</p>
            <button
              type="button"
              onClick={clearRoles}
              className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {t("people.filterAll")}
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {profiles.map((profile) => {
                const username = profile.username ?? "";
                if (!username) return null;
                const isSelf = userId === profile.id;
                const initialFollowing = followingIds.has(profile.id);
                const reasonLine =
                  !isSearchMode && (profile.reason_tags?.length ?? 0) > 0
                    ? formatReasonLine(profile, t)
                    : null;
                const badge = !isSearchMode ? getScoreBadge(profile, t) : null;

                return (
                  <article
                    key={profile.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleCardClick(username)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleCardClick(username);
                      }
                    }}
                    className="flex cursor-pointer items-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-200">
                      {profile.avatar_url ? (
                        <img
                          src={
                            profile.avatar_url.startsWith("http")
                              ? profile.avatar_url
                              : getStorageUrl(profile.avatar_url)
                          }
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg font-medium text-zinc-500">
                          {(profile.display_name ?? username)
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-zinc-900">
                        {profile.display_name ?? username}
                      </p>
                      <p className="text-sm text-zinc-500">@{username}</p>
                      {profile.bio && (
                        <p className="mt-1 line-clamp-2 text-sm text-zinc-600">
                          {profile.bio}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {profile.main_role && (
                          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">
                            {t(`people.role.${profile.main_role}`)}
                          </span>
                        )}
                        {((profile.roles ?? []) as string[])
                          .filter((r) => r !== profile.main_role)
                          .map((r) => (
                            <span
                              key={r}
                              className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600"
                            >
                              {t(`people.role.${r}`)}
                            </span>
                          ))}
                      </div>
                      {reasonLine && (
                        <p className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                          <span>
                            {t("people.whyRecommended")}: {reasonLine}
                          </span>
                          {badge && (
                            <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-zinc-600">
                              {badge}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    {!isSelf && (
                      <div
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <FollowButton
                          targetProfileId={profile.id}
                          initialFollowing={initialFollowing}
                          size="sm"
                        />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {nextCursor && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-lg border border-zinc-300 bg-white px-6 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {loadingMore ? t("people.loading") : t("people.loadMore")}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </AuthGate>
  );
}
