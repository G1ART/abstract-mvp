"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import {
  listMyReceivedMessages,
  markConnectionMessageRead,
  type ConnectionMessageRow,
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
  const [messages, setMessages] = useState<ConnectionMessageRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    const res = await listMyReceivedMessages({ limit: 20, cursor });
    if (res.error) {
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    setMessages((prev) => (cursor ? [...prev, ...res.data] : res.data));
    setNextCursor(res.nextCursor);
    setLoading(false);
    setLoadingMore(false);

    // Eagerly mark the freshly fetched page as read. We do this inside the
    // fetch callback (rather than a follow-up effect) so the /my badge
    // clears in the same tick, and we side-step
    // react-hooks/set-state-in-effect cascading-render warnings.
    if (!cursor) {
      const unreadIds = res.data.filter((m) => !m.read_at).map((m) => m.id);
      if (unreadIds.length > 0) {
        await Promise.all(
          unreadIds.map((id) => markConnectionMessageRead(id)),
        );
        const nowIso = new Date().toISOString();
        setMessages((prev) =>
          prev.map((m) => (m.read_at ? m : { ...m, read_at: nowIso })),
        );
      }
    }
  }, []);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link
          href="/my"
          className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← {t("common.backTo")} {t("nav.myProfile")}
        </Link>
        <h1 className="mb-1 text-xl font-semibold text-zinc-900">
          {t("connection.inbox.title")}
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          {t("connection.inbox.subtitle")}
        </p>

        {loading ? (
          <p className="text-zinc-500">{t("common.loading")}</p>
        ) : messages.length === 0 ? (
          <p className="text-zinc-600">{t("connection.inbox.empty")}</p>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => {
              const sender = m.sender;
              const name =
                sender?.display_name ?? sender?.username ?? "—";
              const avatarSrc = sender?.avatar_url
                ? sender.avatar_url.startsWith("http")
                  ? sender.avatar_url
                  : getArtworkImageUrl(sender.avatar_url, "avatar")
                : null;
              const unread = !m.read_at;
              return (
                <li
                  key={m.id}
                  className={[
                    "rounded-xl border p-4 transition-colors",
                    unread
                      ? "border-zinc-300 bg-white ring-1 ring-zinc-100"
                      : "border-zinc-200 bg-white",
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
                              {t("connection.inbox.unreadBadge")}
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-zinc-400">
                          {relativeTime(m.created_at, locale as "ko" | "en")}
                        </span>
                      </div>
                      {sender?.username && (
                        <p className="text-xs text-zinc-500">
                          @{sender.username}
                        </p>
                      )}
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                        {m.body}
                      </p>
                      {sender?.username && (
                        <Link
                          href={`/u/${sender.username}`}
                          className="mt-3 inline-block text-xs font-medium text-zinc-600 hover:text-zinc-900"
                        >
                          {t("connection.inbox.viewProfile")} →
                        </Link>
                      )}
                    </div>
                  </div>
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
