"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import {
  listPriceInquiriesForArtist,
  replyToPriceInquiry,
  type PriceInquiryRow,
} from "@/lib/supabase/priceInquiries";

export default function MyInquiriesPage() {
  const { t } = useT();
  const [list, setList] = useState<PriceInquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listPriceInquiriesForArtist();
    if (error) {
      setLoading(false);
      return;
    }
    setList(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleReply = useCallback(
    async (inquiryId: string) => {
      const text = replyText[inquiryId]?.trim();
      if (!text) return;
      setReplyingId(inquiryId);
      const { error } = await replyToPriceInquiry(inquiryId, text);
      setReplyingId(null);
      if (error) {
        setToast("Failed to send reply");
        return;
      }
      setReplyText((prev) => {
        const next = { ...prev };
        delete next[inquiryId];
        return next;
      });
      await fetchList();
      setToast("Reply sent");
    },
    [replyText, fetchList]
  );

  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/my" className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900">
          ← {t("nav.myProfile")}
        </Link>
        <h1 className="mb-6 text-xl font-semibold text-zinc-900">{t("priceInquiry.title")}</h1>
        {toast && (
          <p className="mb-4 text-sm text-zinc-600" role="status">
            {toast}
          </p>
        )}
        {loading ? (
          <p className="text-zinc-500">{t("common.loading")}</p>
        ) : list.length === 0 ? (
          <p className="text-zinc-600">{t("priceInquiry.empty")}</p>
        ) : (
          <ul className="space-y-4">
            {list.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-zinc-200 bg-white p-4"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/artwork/${row.artwork_id}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {row.artwork?.title ?? "Untitled"}
                  </Link>
                  <span className="text-zinc-400">·</span>
                  <span className="text-sm text-zinc-600">
                    {row.inquirer?.display_name?.trim() || row.inquirer?.username || "Someone"}
                    {row.inquirer?.username && (
                      <span className="text-zinc-400"> @{row.inquirer.username}</span>
                    )}
                  </span>
                </div>
                <p className="text-xs text-zinc-500">
                  {new Date(row.created_at).toLocaleString()}
                </p>
                {row.message && (
                  <p className="mt-2 text-sm text-zinc-700">{row.message}</p>
                )}
                {row.artist_reply ? (
                  <div className="mt-3 rounded bg-zinc-100 p-3 text-sm text-zinc-800">
                    <span className="font-medium text-zinc-600">{t("priceInquiry.replyFromArtist")}:</span>{" "}
                    {row.artist_reply}
                    {row.replied_at && (
                      <p className="mt-1 text-xs text-zinc-500">
                        {new Date(row.replied_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3">
                    <textarea
                      placeholder={t("priceInquiry.replyPlaceholder")}
                      value={replyText[row.id] ?? ""}
                      onChange={(e) =>
                        setReplyText((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      className="w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      rows={3}
                    />
                    <button
                      type="button"
                      disabled={!replyText[row.id]?.trim() || replyingId === row.id}
                      onClick={() => handleReply(row.id)}
                      className="mt-2 rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {replyingId === row.id ? t("common.loading") : t("priceInquiry.reply")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </AuthGate>
  );
}
