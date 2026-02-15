"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/useT";
import { getSession } from "@/lib/supabase/auth";
import {
  getFollowingIds,
  getRecommendedPeople,
  searchPeople,
  ROLE_OPTIONS,
  type PublicProfile,
} from "@/lib/supabase/artists";
import { getStorageUrl } from "@/lib/supabase/artworks";
import { AuthGate } from "@/components/AuthGate";
import { FollowButton } from "@/components/FollowButton";

const DEBOUNCE_MS = 250;
const INITIAL_LIMIT = 15;
const LOAD_MORE_LIMIT = 10;

type Tab = "recommended" | "search";

function formatReasonLine(
  profile: PublicProfile,
  t: (key: string) => string
): string {
  const tags = profile.reason_tags ?? [];
  const detail = profile.reason_detail;
  const parts: string[] = [];
  for (const tag of tags) {
    if (tag === "shared_themes" && detail?.sharedThemesTop?.length) {
      parts.push(
        `${t("people.reason.sharedThemes")}: ${detail.sharedThemesTop.join(", ")}`
      );
    } else if (tag === "shared_school" && detail?.sharedSchool) {
      parts.push(`${t("people.reason.sharedSchool")}: ${detail.sharedSchool}`);
    } else if (tag === "role_match") {
      parts.push(t("people.reason.roleMatch"));
    } else if (tag === "same_city") {
      parts.push(t("people.reason.sameCity"));
    } else if (tag === "shared_medium") {
      parts.push(t("people.reason.sharedMedium"));
    }
  }
  return parts.join(" · ");
}

export function PeopleClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useT();

  const qFromUrl = searchParams.get("q") ?? "";
  const tabFromUrl = (searchParams.get("tab") as Tab) ?? null;
  const rolesFromUrl = searchParams.get("roles") ?? "";
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState(qFromUrl);
  const [debouncedSearch, setDebouncedSearch] = useState(qFromUrl);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(() => {
    if (!rolesFromUrl) return new Set();
    return new Set(
      rolesFromUrl.split(",").filter((x) => ROLE_OPTIONS.includes(x as (typeof ROLE_OPTIONS)[number]))
    );
  });
  const tab = tabFromUrl === "search" || debouncedSearch.trim() ? "search" : "recommended";

  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateUrl = useCallback(
    (opts: { q?: string; roles?: Set<string>; tab?: Tab; cursor?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (opts.q !== undefined) {
        const v = opts.q.trim();
        if (v) params.set("q", v);
        else params.delete("q");
      }
      if (opts.roles !== undefined) {
        if (opts.roles.size > 0) params.set("roles", Array.from(opts.roles).sort().join(","));
        else params.delete("roles");
      }
      if (opts.tab !== undefined) {
        if (opts.tab === "search") params.set("tab", "search");
        else params.delete("tab");
      }
      if (opts.cursor !== undefined) {
        if (opts.cursor) params.set("cursor", opts.cursor);
        else params.delete("cursor");
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
      updateUrl({ q: debouncedSearch, tab: "search" });
    } else {
      updateUrl({ q: "", tab: "recommended", cursor: null });
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

      if (tab === "search") {
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
        const res = await getRecommendedPeople({
          roles: rolesArr,
          limit: INITIAL_LIMIT,
          cursor: null,
        });
        if (res.error) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[People] getRecommendedPeople RPC error:", res.error);
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
  }, [tab, debouncedSearch, rolesArr.join(","), t]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      if (tab === "search") {
        const res = await searchPeople({
          q: debouncedSearch.trim(),
          roles: rolesArr,
          limit: LOAD_MORE_LIMIT,
          cursor: nextCursor,
        });
        if (res.error) return;
        setProfiles((prev) => [...prev, ...res.data]);
        setNextCursor(res.nextCursor);
        updateUrl({ cursor: res.nextCursor });
      } else {
        const res = await getRecommendedPeople({
          roles: rolesArr,
          limit: LOAD_MORE_LIMIT,
          cursor: nextCursor,
        });
        if (res.error) return;
        setProfiles((prev) => [...prev, ...res.data]);
        setNextCursor(res.nextCursor);
        updateUrl({ cursor: res.nextCursor });
      }
    } finally {
      setLoadingMore(false);
    }
  }, [tab, debouncedSearch, rolesArr.join(","), nextCursor, loadingMore, updateUrl]);

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

  const emptyRecommendations = !loading && tab === "recommended" && profiles.length === 0;
  const emptySearch = !loading && tab === "search" && profiles.length === 0;

  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold">{t("people.title")}</h1>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setDebouncedSearch("");
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === "recommended"
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            {t("people.tabRecommended")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!search.trim()) searchInputRef.current?.focus();
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === "search" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            {t("people.tabSearch")}
          </button>
        </div>

        <input
          ref={searchInputRef}
          type="search"
          placeholder={t("people.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full rounded border border-zinc-300 px-3 py-2"
        />

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
            {tab === "recommended" && (
              <h2 className="mb-4 text-sm font-medium text-zinc-600">
                {t("people.recommendedTitle")}
              </h2>
            )}
            <div className="space-y-4">
              {profiles.map((profile) => {
                const username = profile.username ?? "";
                if (!username) return null;
                const isSelf = userId === profile.id;
                const initialFollowing = followingIds.has(profile.id);

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
                          {(profile.display_name ?? username).charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-zinc-900">
                        {profile.display_name ?? username}
                      </p>
                      <p className="text-sm text-zinc-500">@{username}</p>
                      {profile.bio && (
                        <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{profile.bio}</p>
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
                      {tab === "recommended" &&
                        (profile.reason_tags?.length ?? 0) > 0 && (
                          <p className="mt-2 text-xs text-zinc-500">
                            {t("people.whyRecommended")}:{" "}
                            {formatReasonLine(profile, t)}
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
