"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/useT";
import { getSession } from "@/lib/supabase/auth";
import {
  getFollowingIds,
  listPublicProfiles,
  ROLE_OPTIONS,
  searchPublicProfiles,
  type PublicProfile,
} from "@/lib/supabase/artists";
import { getStorageUrl } from "@/lib/supabase/artworks";
import { AuthGate } from "@/components/AuthGate";
import { FollowButton } from "@/components/FollowButton";

const DEBOUNCE_MS = 250;

export function PeopleClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useT();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get("q") ?? "");
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(() => {
    const r = searchParams.get("roles");
    if (!r) return new Set();
    return new Set(r.split(",").filter((x) => ROLE_OPTIONS.includes(x as (typeof ROLE_OPTIONS)[number])));
  });
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateUrl = useCallback(
    (q: string, roles: Set<string>) => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (roles.size > 0) params.set("roles", Array.from(roles).sort().join(","));
      const s = params.toString();
      const url = s ? `/people?${s}` : "/people";
      router.replace(url, { scroll: false });
    },
    [router]
  );

  useEffect(() => {
    getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    const roles = selectedRoles.size > 0 ? Array.from(selectedRoles) : undefined;
    try {
      const [profilesRes, followingRes] = await Promise.all([
        debouncedSearch.trim()
          ? searchPublicProfiles(debouncedSearch.trim(), { limit: 50, roles })
          : listPublicProfiles({ limit: 50, offset: 0, roles }),
        getFollowingIds(),
      ]);

      if (profilesRes.error) {
        setError(
          profilesRes.error instanceof Error ? profilesRes.error.message : "Failed to load people"
        );
        return;
      }
      setProfiles(profilesRes.data);
      setFollowingIds(followingRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedRoles]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  function toggleRole(role: string) {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      updateUrl(debouncedSearch, next);
      return next;
    });
  }

  function clearRoles() {
    setSelectedRoles(new Set());
    updateUrl(debouncedSearch, new Set());
  }

  useEffect(() => {
    updateUrl(debouncedSearch, selectedRoles);
  }, [debouncedSearch, selectedRoles, updateUrl]);

  function handleCardClick(username: string) {
    router.push(`/u/${username}`);
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold">{t("people.title")}</h1>

        <input
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
        ) : profiles.length === 0 ? (
          <p className="py-12 text-center text-zinc-600">{t("people.noPeople")}</p>
        ) : (
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
        )}
      </main>
    </AuthGate>
  );
}
