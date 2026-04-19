"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/useT";
import { getSession } from "@/lib/supabase/auth";
import { getFollowingIds } from "@/lib/supabase/artists";
import {
  getPeopleRecommendations,
  ROLE_OPTIONS,
  type PeopleLane,
  type PeopleRec,
} from "@/lib/supabase/recommendations";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";
import { AuthGate } from "@/components/AuthGate";
import { FollowButton } from "@/components/FollowButton";
import {
  formatIdentityPair,
  formatRoleChips,
} from "@/lib/identity/format";
import { reasonTagToI18n } from "@/lib/people/reason";
import { SectionFrame } from "@/components/ds/SectionFrame";
import { Chip } from "@/components/ds/Chip";
import { IntroMessageAssist } from "@/components/ai/IntroMessageAssist";
import { getMyProfile } from "@/lib/supabase/me";
import { getProfileSurface } from "@/lib/profile/surface";

const DEBOUNCE_MS = 250;
const INITIAL_LIMIT = 15;
const LOAD_MORE_LIMIT = 10;

type LaneKey = "follow" | "likes" | "expand";
const LANE_TO_CONTRACT: Record<LaneKey, PeopleLane> = {
  follow: "follow_graph",
  likes: "likes_based",
  expand: "expand",
};

function formatReasonLine(profile: PeopleRec, t: (key: string) => string): string {
  const detail = profile.reason_detail ?? {};
  return reasonTagToI18n(profile.reason_tags ?? [], t, {
    medium: typeof detail.medium === "string" ? detail.medium : null,
    city: typeof detail.city === "string" ? detail.city : null,
  });
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
  const [searchSuggestion, setSearchSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<{
    display_name: string | null;
    main_role: string | null;
    themes: string[];
    mediums: string[];
    city: string | null;
  } | null>(null);
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
    getMyProfile().then(({ data }) => {
      if (!data) return;
      const surface = getProfileSurface(data);
      if (!surface) return;
      setMyProfile({
        display_name: surface.displayName,
        main_role: surface.mainRole,
        themes: [...surface.details.themes],
        mediums: [...surface.details.mediums],
        city: surface.details.city,
      });
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

      const contractLane: PeopleLane = isSearchMode
        ? "search"
        : LANE_TO_CONTRACT[lane];
      const res = await getPeopleRecommendations({
        lane: contractLane,
        q: isSearchMode ? debouncedSearch.trim() : undefined,
        roles: rolesArr,
        limit: INITIAL_LIMIT,
        cursor: null,
        searchVariant: isSearchMode ? "merged" : undefined,
      });
      if (res.error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[People] getPeopleRecommendations error:", res.error);
        }
        setError(t("people.loadFailed"));
        return;
      }
      setProfiles(res.data);
      setNextCursor(res.nextCursor);
      setSearchSuggestion(isSearchMode ? res.suggestion : null);
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
      const contractLane: PeopleLane = isSearchMode
        ? "search"
        : LANE_TO_CONTRACT[lane];
      const res = await getPeopleRecommendations({
        lane: contractLane,
        q: isSearchMode ? debouncedSearch.trim() : undefined,
        roles: rolesArr,
        limit: LOAD_MORE_LIMIT,
        cursor: nextCursor,
        searchVariant: isSearchMode ? "merged" : undefined,
      });
      if (res.error) return;
      setProfiles((prev) => [...prev, ...res.data]);
      setNextCursor(res.nextCursor);
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
          <p className="text-zinc-600">{t("common.loading")}</p>
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
            {searchSuggestion && (
              <p className="mb-3 text-zinc-700">
                {t("people.didYouMean").replace("{suggestion}", searchSuggestion)}
              </p>
            )}
            <div className="mb-6 flex flex-wrap justify-center gap-2">
              {searchSuggestion && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch(searchSuggestion);
                    setDebouncedSearch(searchSuggestion);
                    updateUrl({ q: searchSuggestion });
                    setSearchSuggestion(null);
                  }}
                  className="rounded border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  {t("people.searchSuggestion").replace("{suggestion}", searchSuggestion)}
                </button>
              )}
              <button
                type="button"
                onClick={clearRoles}
                className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {t("people.filterAll")}
              </button>
            </div>
            <SectionFrame tone="muted" padding="md" noMargin className="text-left">
              <p className="mb-2 text-sm font-medium text-zinc-700">{t("people.inviteCta")}</p>
              <Link
                href={`/people/invite?name=${encodeURIComponent(debouncedSearch.trim())}`}
                className="inline-block rounded-lg border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                {t("people.inviteCtaButton")}
              </Link>
            </SectionFrame>
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
                const identity = formatIdentityPair(profile);
                const roleChips = formatRoleChips(profile, t, { max: 3 });

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
                    className="flex cursor-pointer items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-200">
                      {profile.avatar_url ? (
                        <img
                          src={
                            profile.avatar_url.startsWith("http")
                              ? profile.avatar_url
                              : getArtworkImageUrl(profile.avatar_url, "avatar")
                          }
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg font-medium text-zinc-500">
                          {identity.primary.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-zinc-900">
                        {identity.primary}
                      </p>
                      {identity.secondary && (
                        <p className="text-sm text-zinc-500">{identity.secondary}</p>
                      )}
                      {profile.bio && (
                        <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-zinc-600">
                          {profile.bio}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {roleChips.map((chip) => (
                          <Chip key={chip.key} tone={chip.isPrimary ? "accent" : "neutral"}>
                            {chip.label}
                          </Chip>
                        ))}
                      </div>
                      {reasonLine && (
                        <p className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                          <span>
                            {t("people.whyRecommended")}: {reasonLine}
                          </span>
                          {badge && <Chip tone="muted">{badge}</Chip>}
                        </p>
                      )}
                    </div>
                    {!isSelf && (
                      <div
                        className="flex shrink-0 flex-col items-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <FollowButton
                          targetProfileId={profile.id}
                          initialFollowing={initialFollowing}
                          size="sm"
                        />
                        {userId && (
                          <IntroMessageAssist
                            me={{
                              display_name: myProfile?.display_name ?? null,
                              role: myProfile?.main_role ?? null,
                              themes: myProfile?.themes ?? [],
                              mediums: myProfile?.mediums ?? [],
                              city: myProfile?.city ?? null,
                            }}
                            recipient={{
                              id: profile.id,
                              display_name: profile.display_name,
                              role: profile.main_role,
                              sharedSignals: profile.reason_tags ?? [],
                            }}
                          />
                        )}
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
                  {loadingMore ? t("common.loading") : t("people.loadMore")}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </AuthGate>
  );
}
