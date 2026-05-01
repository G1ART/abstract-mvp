"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import {
  listMyConversations,
  type ConversationSummary,
} from "@/lib/supabase/connectionMessages";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";

function relativeTime(iso: string, locale: "ko" | "en"): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const sec = Math.max(1, Math.floor(diffMs / 1000));
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (locale === "ko") {
    if (sec < 60) return "방금";
    if (min < 60) return `${min}분 전`;
    if (hr < 24) return `${hr}시간 전`;
    if (day < 7) return `${day}일 전`;
    return new Date(iso).toLocaleDateString("ko-KR");
  }
  if (sec < 60) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-US");
}

export default function MyMessagesPage() {
  const { t, locale } = useT();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (cursor?: string | null) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    const res = await listMyConversations({ limit: 20, beforeTs: cursor ?? null });
    if (res.error) {
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    setConversations((prev) => (cursor ? [...prev, ...res.data] : res.data));
    setNextCursor(res.nextCursor);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => {
    // Defer the initial fetch to the next frame so the setState calls
    // inside `fetchPage` don't fire synchronously from an effect body
    // (react-hooks/set-state-in-effect). Matches the pattern used by
    // `/my/network/page.tsx` and `/dev/entitlements/page.tsx`.
    const handle = requestAnimationFrame(() => {
      void fetchPage();
    });
    return () => cancelAnimationFrame(handle);
  }, [fetchPage]);

  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link
          href="/my"
          className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← {t("profile.privateBackToMy")}
        </Link>
        <h1 className="mb-1 text-xl font-semibold text-zinc-900">
          {t("connection.inbox.title")}
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          {t("connection.inbox.subtitleThreads")}
        </p>

        {loading ? (
          <p className="text-zinc-500">{t("common.loading")}</p>
        ) : conversations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/70 p-8 text-center">
            <p className="text-sm text-zinc-600">
              {t("connection.inbox.empty")}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              {t("connection.inbox.emptyHint")}
            </p>
            <Link
              href="/people"
              className="mt-4 inline-block text-xs font-medium text-zinc-700 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              {t("connection.inbox.findPeople")} →
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {conversations.map((c) => {
              const peer = c.otherUser;
              const name =
                peer?.display_name ?? peer?.username ?? t("connection.inbox.unknownUser");
              const handle = peer?.username ? `@${peer.username}` : null;
              const avatarSrc = peer?.avatar_url
                ? peer.avatar_url.startsWith("http")
                  ? peer.avatar_url
                  : getArtworkImageUrl(peer.avatar_url, "avatar")
                : null;
              const unread = c.unreadCount > 0;
              // Thread URL prefers the username (prettier + stable) but
              // falls back to the peer user id when the counterpart has
              // no username (placeholder/onboarding accounts).
              const href = peer?.username
                ? `/my/messages/${encodeURIComponent(peer.username)}`
                : `/my/messages/${c.otherUserId}`;
              const preview = c.lastIsFromMe
                ? `${t("connection.inbox.youLabel")} ${c.lastBody}`
                : c.lastBody;
              return (
                <li key={c.participantKey}>
                  <Link
                    href={href}
                    className={[
                      "block rounded-xl border p-4 transition-colors",
                      unread
                        ? "border-zinc-300 bg-white ring-1 ring-zinc-100 hover:border-zinc-400"
                        : "border-zinc-200 bg-white hover:border-zinc-300",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-3">
                      {avatarSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarSrc}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-base font-medium text-zinc-600">
                          {name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="truncate font-medium text-zinc-900">
                              {name}
                            </p>
                            {unread && (
                              <span className="inline-flex shrink-0 items-center rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                {c.unreadCount > 1 ? c.unreadCount : t("connection.inbox.unreadBadge")}
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-xs text-zinc-400">
                            {relativeTime(c.lastCreatedAt, locale as "ko" | "en")}
                          </span>
                        </div>
                        {handle && (
                          <p className="text-xs text-zinc-500">{handle}</p>
                        )}
                        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-zinc-700">
                          {preview}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
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
              {loadingMore
                ? t("common.loading")
                : t("connection.inbox.loadMore")}
            </button>
          </div>
        )}
      </main>
    </AuthGate>
  );
}
