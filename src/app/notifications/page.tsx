"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import {
  listNotifications,
  markAllAsRead,
  type NotificationRow,
  type NotificationType,
} from "@/lib/supabase/notifications";
import { useT } from "@/lib/i18n/useT";

function notificationLabel(row: NotificationRow, t: (k: string) => string): string {
  const name = row.actor?.display_name?.trim() || row.actor?.username || "Someone";
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
    default:
      return "";
  }
}

function notificationLink(row: NotificationRow): string | null {
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

  useEffect(() => {
    let mounted = true;
    listNotifications({ limit: 50 }).then(({ data }) => {
      if (mounted) setList(data);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    markAllAsRead().then(() => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("notifications-read"));
      }
    });
  }, []);

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
      <h1 className="text-xl font-semibold text-zinc-900">{t("notifications.title")}</h1>
      {list.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">{t("notifications.empty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100">
          {list.map((row) => {
            const href = notificationLink(row);
            const label = notificationLabel(row, t);
            const content = (
              <span className="block py-3 text-sm text-zinc-700">
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
                  <Link href={href} className="block hover:bg-zinc-50">
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
