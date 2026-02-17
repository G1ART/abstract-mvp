"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { getMyFollowers, type FollowProfileRow } from "@/lib/supabase/follows";
import { FollowButton } from "@/components/FollowButton";
import { isFollowing } from "@/lib/supabase/follows";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";

export default function MyFollowersPage() {
  const { t } = useT();
  const [profiles, setProfiles] = useState<FollowProfileRow[]>([]);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    const res = await getMyFollowers({ limit: 20, cursor });
    if (res.error) {
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    setProfiles((prev) => (cursor ? [...prev, ...res.data] : res.data));
    setNextCursor(res.nextCursor);
    if (res.data.length > 0) {
      const ids = res.data.map((p) => p.id);
      const results = await Promise.all(ids.map((id) => isFollowing(id)));
      setFollowingMap((prev) => {
        const next = { ...prev };
        results.forEach((r, i) => {
          next[ids[i]] = r.data ?? false;
        });
        return next;
      });
    }
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/my" className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900">
          ← {t("nav.myProfile")}
        </Link>
        <h1 className="mb-6 text-xl font-semibold text-zinc-900">{t("my.kpi.followers")}</h1>
        {loading ? (
          <p className="text-zinc-500">{t("common.loading")}</p>
        ) : profiles.length === 0 ? (
          <p className="text-zinc-600">{t("my.followersEmpty")}</p>
        ) : (
          <ul className="space-y-4">
            {profiles.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-4"
              >
                <Link
                  href={`/u/${p.username ?? ""}`}
                  className="flex min-w-0 flex-1 items-center gap-4"
                >
                  {p.avatar_url ? (
                    <img
                      src={
                        p.avatar_url.startsWith("http")
                          ? p.avatar_url
                          : getArtworkImageUrl(p.avatar_url, "avatar")
                      }
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-lg font-medium text-zinc-600">
                      {(p.display_name ?? p.username ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900">
                      {p.display_name ?? p.username ?? "—"}
                    </p>
                    {p.username && (
                      <p className="text-sm text-zinc-500">@{p.username}</p>
                    )}
                    {p.bio && (
                      <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-zinc-600">{p.bio}</p>
                    )}
                  </div>
                </Link>
                <FollowButton
                  targetProfileId={p.id}
                  initialFollowing={followingMap[p.id] ?? false}
                  size="sm"
                />
              </li>
            ))}
          </ul>
        )}
        {nextCursor && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => fetchPage(nextCursor)}
              disabled={loadingMore}
              className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {loadingMore ? t("common.loading") : t("feed.loadMore")}
            </button>
          </div>
        )}
      </main>
    </AuthGate>
  );
}
