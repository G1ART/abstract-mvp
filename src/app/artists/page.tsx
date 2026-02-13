"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/supabase/auth";
import {
  getFollowingIds,
  listPublicProfiles,
  searchPublicProfiles,
  type PublicProfile,
} from "@/lib/supabase/artists";
import { getStorageUrl } from "@/lib/supabase/artworks";
import { AuthGate } from "@/components/AuthGate";
import { FollowButton } from "@/components/FollowButton";

const DEBOUNCE_MS = 250;

export default function ArtistsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const [profilesRes, followingRes] = await Promise.all([
        debouncedSearch.trim()
          ? searchPublicProfiles(debouncedSearch.trim(), { limit: 50 })
          : listPublicProfiles({ limit: 50, offset: 0 }),
        getFollowingIds(),
      ]);

      if (profilesRes.error) {
        setError(
          profilesRes.error instanceof Error
            ? profilesRes.error.message
            : "Failed to load artists"
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
  }, [debouncedSearch]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  function handleCardClick(username: string) {
    router.push(`/u/${username}`);
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold">Find artists</h1>

        <input
          type="search"
          placeholder="Search by username or display name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-6 w-full rounded border border-zinc-300 px-3 py-2"
        />

        {loading ? (
          <p className="text-zinc-600">Loading...</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : profiles.length === 0 ? (
          <p className="py-12 text-center text-zinc-600">
            No artists found.
          </p>
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
                    <div className="mt-1 flex flex-wrap gap-1">
                      {profile.main_role && (
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">
                          {profile.main_role}
                        </span>
                      )}
                      {((profile.roles ?? []) as string[])
                        .filter((r) => r !== profile.main_role)
                        .map((r) => (
                          <span
                            key={r}
                            className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600"
                          >
                            {r}
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
