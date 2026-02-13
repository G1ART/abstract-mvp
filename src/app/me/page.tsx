"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { ArtworkCard } from "@/components/ArtworkCard";
import {
  getMyProfile,
  getMyStats,
  listMyArtworks,
  type MyStats,
} from "@/lib/supabase/me";
import { type ArtworkWithLikes, getStorageUrl } from "@/lib/supabase/artworks";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  main_role: string | null;
  roles: string[] | null;
};

export default function MePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [artworks, setArtworks] = useState<ArtworkWithLikes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, statsRes, artworksRes] = await Promise.all([
        getMyProfile(),
        getMyStats(),
        listMyArtworks({ limit: 50 }),
      ]);

      if (profileRes.error) {
        setError(
          profileRes.error instanceof Error ? profileRes.error.message : "Failed to load profile"
        );
        return;
      }
      if (statsRes.error) {
        setError(
          statsRes.error instanceof Error ? statsRes.error.message : "Failed to load stats"
        );
        return;
      }

      setProfile(profileRes.data as Profile | null);
      setStats(statsRes.data ?? null);
      setArtworks(artworksRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    function onFocus() {
      fetchData();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchData]);

  if (loading) {
    return (
      <AuthGate>
        <main className="mx-auto max-w-4xl px-4 py-8">
          <p className="text-zinc-600">Loading...</p>
        </main>
      </AuthGate>
    );
  }

  if (error) {
    return (
      <AuthGate>
        <main className="mx-auto max-w-4xl px-4 py-8">
          <p className="text-red-600">{error}</p>
        </main>
      </AuthGate>
    );
  }

  const roles = (profile?.roles ?? []) as string[];

  return (
    <AuthGate>
      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-start gap-4">
          {profile?.avatar_url && (
            <img
              src={
                profile.avatar_url.startsWith("http")
                  ? profile.avatar_url
                  : getStorageUrl(profile.avatar_url)
              }
              alt=""
              className="h-16 w-16 rounded-full object-cover"
            />
          )}
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">
              {profile?.display_name ?? profile?.username ?? "Me"}
            </h1>
            {profile?.username && (
              <p className="text-sm text-zinc-500">@{profile.username}</p>
            )}
            {roles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {roles.map((r) => (
                  <span
                    key={r}
                    className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-700"
                  >
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>
          </div>
          <Link
            href="/settings"
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            Edit profile
          </Link>
        </div>

        {/* KPI cards */}
        <div className="mb-8 grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-2xl font-semibold text-zinc-900">
              {stats?.artworksCount ?? 0}
            </p>
            <p className="text-sm text-zinc-500">Artworks</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-2xl font-semibold text-zinc-900">
              {stats?.followersCount ?? 0}
            </p>
            <p className="text-sm text-zinc-500">Followers</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-2xl font-semibold text-zinc-900">
              {stats?.viewsCount ?? 0}
            </p>
            <p className="text-sm text-zinc-500">Views</p>
          </div>
        </div>

        {/* Upload CTA */}
        <div className="mb-8 flex gap-3">
          <Link
            href="/upload"
            className="inline-block rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Upload new work
          </Link>
          <Link
            href="/artists"
            className="inline-block rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Find artists
          </Link>
        </div>

        {/* My artworks */}
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">My artworks</h2>
        {artworks.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-zinc-200 bg-zinc-50 py-12 text-center">
            <p className="text-zinc-600">No works yet</p>
            <Link
              href="/upload"
              className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Upload your first work
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {artworks.map((artwork) => (
              <ArtworkCard
                key={artwork.id}
                artwork={artwork}
                likesCount={artwork.likes_count ?? 0}
              />
            ))}
          </div>
        )}
      </main>
    </AuthGate>
  );
}
