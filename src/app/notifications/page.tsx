"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import {
  listNotifications,
  markAllAsRead,
  markNotificationRead,
  type NotificationRow,
} from "@/lib/supabase/notifications";
import { useT } from "@/lib/i18n/useT";
import { formatDisplayName } from "@/lib/identity/format";
import { EmptyState } from "@/components/ds/EmptyState";

function notificationLabel(row: NotificationRow, t: (k: string) => string): string {
  const name = formatDisplayName(row.actor);
  const title = row.artwork?.title || "Untitled";
  switch (row.type) {
    case "like":
      return t("notifications.likeText").replace("{name}", name).replace("{title}", title);
    case "follow":
      return t("notifications.followText").replace("{name}", name);
    case "claim_request":
      return t("notifications.claimRequestText").replace("{name}", name).replace("{title}", title);
    case "claim_confirmed":
      return t("notifications.claimConfirmedText").replace("{name}", name).replace("{title}", title);
    case "claim_rejected":
      return t("notifications.claimRejectedText").replace("{name}", name).replace("{title}", title);
    case "price_inquiry":
      return t("notifications.priceInquiryText").replace("{name}", name).replace("{title}", title);
    case "price_inquiry_reply":
      return t("notifications.priceInquiryReplyText").replace("{name}", name).replace("{title}", title);
    case "new_work": {
      if (row.payload?.source === "interest") {
        return `New work matching your "${row.payload.interest_type ?? ""}" interest: ${title}`;
      }
      return `${name} uploaded a new work: ${title}`;
    }
    case "connection_message":
      return t("notifications.connectionMessageText").replace("{name}", name);
    default:
      return "";
  }
}

function notificationLink(row: NotificationRow): string | null {
  if (row.type === "price_inquiry" || row.type === "price_inquiry_reply") {
    return "/my/inquiries";
  }
  if (row.type === "connection_message") {
    return "/my/messages";
  }
  if (row.type === "follow" && row.actor_id) {
    const u = row.actor?.username;
    return u ? `/u/${u}` : null;
  }
  if (row.artwork_id) return `/artwork/${row.artwork_id}`;
  return null;
}

function NotificationsContent() {
  const { t } = useT();
  const [list, setList] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const refresh = useCallback(() => {
    listNotifications({ limit: 50 }).then(({ data }) => {
      setList(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      refresh();
    });
    return () => cancelAnimationFrame(t);
  }, [refresh]);

  const handleMarkAll = useCallback(async () => {
    setMarkingAll(true);
    await markAllAsRead();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("notifications-read"));
    }
    await refresh();
    setMarkingAll(false);
  }, [refresh]);

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-zinc-600">{t("common.loading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/feed?tab=all&sort=latest"
        className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900"
      >
        ← {t("common.backTo")} {t("nav.feed")}
      </Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900">{t("notifications.title")}</h1>
        {list.length > 0 && (
          <button
            type="button"
            disabled={markingAll}
            onClick={() => void handleMarkAll()}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {markingAll ? t("common.loading") : t("notifications.markAllRead")}
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <EmptyState title={t("notifications.empty")} size="sm" />
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100">
          {list.map((row) => {
            const href = notificationLink(row);
            const label = notificationLabel(row, t);
            const unread = row.read_at == null;
            const content = (
              <span className="block py-3 text-sm text-zinc-700">
                {unread && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-blue-500 align-middle" aria-hidden />}
                {label}
                <span className="ml-2 text-zinc-400">
                  {new Date(row.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </span>
            );
            return (
              <li key={row.id}>
                {href ? (
                  <Link
                    href={href}
                    className="block hover:bg-zinc-50"
                    onClick={() => {
                      void markNotificationRead(row.id);
                      window.dispatchEvent(new CustomEvent("notifications-read"));
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export default function NotificationsPage() {
  return (
    <AuthGate>
      <NotificationsContent />
    </AuthGate>
  );
}
