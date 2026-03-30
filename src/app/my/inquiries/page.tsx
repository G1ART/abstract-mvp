"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useActingAs } from "@/context/ActingAsContext";
import { useT } from "@/lib/i18n/useT";
import {
  listPriceInquiriesForArtist,
  listPriceInquiryMessages,
  listInquiryNotes,
  addInquiryNote,
  markPriceInquiryRead,
  replyToPriceInquiry,
  setPriceInquiryStatus,
  updateInquiryPipeline,
  type InquiryListCursor,
  type InquiryNoteRow,
  type InquiryStatus,
  type PipelineStage,
  type PriceInquiryMessageRow,
  type PriceInquiryRow,
} from "@/lib/supabase/priceInquiries";

export default function MyInquiriesPage() {
  const { t } = useT();
  const { actingAsProfileId } = useActingAs();
  const [list, setList] = useState<PriceInquiryRow[]>([]);
  const [nextCursor, setNextCursor] = useState<InquiryListCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [pipelineFilter, setPipelineFilter] = useState<PipelineStage | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messagesByInquiry, setMessagesByInquiry] = useState<Record<string, PriceInquiryMessageRow[]>>({});
  const [notesByInquiry, setNotesByInquiry] = useState<Record<string, InquiryNoteRow[]>>({});
  const [noteText, setNoteText] = useState<Record<string, string>>({});
  const [loadingMessages, setLoadingMessages] = useState<string | null>(null);

  useEffect(() => {
    const tmr = setTimeout(() => setSearchDebounced(search.trim()), 350);
    return () => clearTimeout(tmr);
  }, [search]);

  const fetchFirstPage = useCallback(async () => {
    setLoading(true);
    const { data, nextCursor: nc, error } = await listPriceInquiriesForArtist({
      profileId: actingAsProfileId ?? undefined,
      limit: 20,
      cursor: null,
      status: statusFilter,
      pipelineStage: pipelineFilter,
      search: searchDebounced,
    });
    if (error) {
      setLoading(false);
      return;
    }
    setList(data ?? []);
    setNextCursor(nc);
    setLoading(false);
  }, [actingAsProfileId, statusFilter, pipelineFilter, searchDebounced]);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      void fetchFirstPage();
    });
    return () => cancelAnimationFrame(t);
  }, [fetchFirstPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const { data, nextCursor: nc, error } = await listPriceInquiriesForArtist({
      profileId: actingAsProfileId ?? undefined,
      limit: 20,
      cursor: nextCursor,
      pipelineStage: pipelineFilter,
      status: statusFilter,
      search: searchDebounced,
    });
    setLoadingMore(false);
    if (error) return;
    setList((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const add = (data ?? []).filter((r) => !seen.has(r.id));
      return [...prev, ...add];
    });
    setNextCursor(nc);
  }, [nextCursor, loadingMore, actingAsProfileId, statusFilter, searchDebounced]);

  const openThread = useCallback(
    async (row: PriceInquiryRow) => {
      const id = row.id;
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      void markPriceInquiryRead(id);
      setLoadingMessages(id);
      const [{ data, error }, { data: notes }] = await Promise.all([
        listPriceInquiryMessages(id),
        listInquiryNotes(id),
      ]);
      setLoadingMessages(null);
      if (!error && data) {
        setMessagesByInquiry((prev) => ({ ...prev, [id]: data }));
      }
      if (notes) {
        setNotesByInquiry((prev) => ({ ...prev, [id]: notes }));
      }
    },
    [expandedId]
  );

  const handleReply = useCallback(
    async (inquiryId: string) => {
      const text = replyText[inquiryId]?.trim();
      if (!text) return;
      setReplyingId(inquiryId);
      const { error } = await replyToPriceInquiry(inquiryId, text);
      setReplyingId(null);
      if (error) {
        setToast(t("common.replyFailed"));
        return;
      }
      setReplyText((prev) => {
        const next = { ...prev };
        delete next[inquiryId];
        return next;
      });
      const { data: msgs } = await listPriceInquiryMessages(inquiryId);
      if (msgs) setMessagesByInquiry((prev) => ({ ...prev, [inquiryId]: msgs }));
      await fetchFirstPage();
      setToast(t("common.replySent"));
    },
    [replyText, fetchFirstPage, t]
  );

  const handleStatusChange = useCallback(
    async (inquiryId: string, status: InquiryStatus) => {
      const { error } = await setPriceInquiryStatus(inquiryId, status);
      if (error) {
        setToast(t("priceInquiry.statusUpdateFailed"));
        return;
      }
      setList((prev) =>
        prev.map((r) => (r.id === inquiryId ? { ...r, inquiry_status: status } : r))
      );
      setToast(t("priceInquiry.statusUpdated"));
    },
    [t]
  );

  const handlePipelineChange = useCallback(
    async (inquiryId: string, stage: PipelineStage) => {
      const { error } = await updateInquiryPipeline(inquiryId, { pipeline_stage: stage });
      if (error) { setToast(t("priceInquiry.statusUpdateFailed")); return; }
      setList((prev) => prev.map((r) => (r.id === inquiryId ? { ...r, pipeline_stage: stage } : r)));
    },
    [t]
  );

  const handleAddNote = useCallback(
    async (inquiryId: string) => {
      const text = noteText[inquiryId]?.trim();
      if (!text) return;
      const { error } = await addInquiryNote(inquiryId, text);
      if (error) { setToast(t("common.replyFailed")); return; }
      setNoteText((prev) => { const n = { ...prev }; delete n[inquiryId]; return n; });
      const { data: notes } = await listInquiryNotes(inquiryId);
      if (notes) setNotesByInquiry((prev) => ({ ...prev, [inquiryId]: notes }));
    },
    [noteText, t]
  );

  const handleNextActionDate = useCallback(
    async (inquiryId: string, date: string) => {
      await updateInquiryPipeline(inquiryId, { next_action_date: date || null });
      setList((prev) => prev.map((r) => (r.id === inquiryId ? { ...r, next_action_date: date || null } : r)));
    },
    []
  );

  const unreadCount = useMemo(() => list.filter((r) => r.artist_unread === true).length, [list]);

  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/my" className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900">
          ← {t("common.backTo")} {t("nav.myProfile")}
        </Link>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">{t("priceInquiry.title")}</h1>
            {unreadCount > 0 && (
              <p className="mt-1 text-sm text-amber-700">{t("priceInquiry.unreadBadge").replace("{n}", String(unreadCount))}</p>
            )}
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("priceInquiry.searchPlaceholder")}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm sm:max-w-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as InquiryStatus | "all")}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="all">{t("priceInquiry.filterAll")}</option>
            <option value="new">{t("priceInquiry.filterNew")}</option>
            <option value="open">{t("priceInquiry.filterOpen")}</option>
            <option value="replied">{t("priceInquiry.filterReplied")}</option>
            <option value="closed">{t("priceInquiry.filterClosed")}</option>
          </select>
          <select
            value={pipelineFilter}
            onChange={(e) => setPipelineFilter(e.target.value as PipelineStage | "all")}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="all">Pipeline: All</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="in_discussion">In Discussion</option>
            <option value="offer_sent">Offer Sent</option>
            <option value="closed_won">Closed Won</option>
            <option value="closed_lost">Closed Lost</option>
          </select>
        </div>

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
            {list.map((row) => {
              const expanded = expandedId === row.id;
              const msgs = messagesByInquiry[row.id];
              return (
                <li
                  key={row.id}
                  className={`rounded-lg border bg-white p-4 ${
                    row.artist_unread ? "border-amber-200 ring-1 ring-amber-100" : "border-zinc-200"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void openThread(row)}
                      className="text-left font-medium text-zinc-900 hover:underline"
                    >
                      {row.artwork?.title ?? "Untitled"}
                    </button>
                    <Link
                      href={`/artwork/${row.artwork_id}`}
                      className="text-xs text-zinc-500 hover:text-zinc-800"
                      onClick={() => void markPriceInquiryRead(row.id)}
                    >
                      {t("priceInquiry.viewArtwork")}
                    </Link>
                    {row.artist_unread && (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                        {t("priceInquiry.unread")}
                      </span>
                    )}
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
                    <span>
                      {row.inquirer?.display_name?.trim() || row.inquirer?.username || "Someone"}
                      {row.inquirer?.username && (
                        <span className="text-zinc-400"> @{row.inquirer.username}</span>
                      )}
                    </span>
                    <span className="text-zinc-400">·</span>
                    <span className="text-xs text-zinc-500">
                      {row.last_message_at
                        ? new Date(row.last_message_at).toLocaleString()
                        : new Date(row.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-zinc-500">{t("priceInquiry.statusLabel")}</label>
                      <select
                        value={row.inquiry_status ?? "open"}
                        onChange={(e) => void handleStatusChange(row.id, e.target.value as InquiryStatus)}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs"
                      >
                        <option value="new">new</option>
                        <option value="open">open</option>
                        <option value="replied">replied</option>
                        <option value="closed">closed</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-zinc-500">Pipeline</label>
                      <select
                        value={row.pipeline_stage ?? "new"}
                        onChange={(e) => void handlePipelineChange(row.id, e.target.value as PipelineStage)}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs"
                      >
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="in_discussion">In Discussion</option>
                        <option value="offer_sent">Offer Sent</option>
                        <option value="closed_won">Won</option>
                        <option value="closed_lost">Lost</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-zinc-500">Next action</label>
                      <input
                        type="date"
                        value={row.next_action_date ?? ""}
                        onChange={(e) => void handleNextActionDate(row.id, e.target.value)}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs"
                      />
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-3 border-t border-zinc-100 pt-3">
                      {loadingMessages === row.id ? (
                        <p className="text-sm text-zinc-500">{t("common.loading")}</p>
                      ) : msgs && msgs.length > 0 ? (
                        <ul className="mb-4 space-y-3">
                          {msgs.map((m) => (
                            <li key={m.id} className="rounded bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
                              <span className="text-xs text-zinc-500">
                                {new Date(m.created_at).toLocaleString()}
                              </span>
                              <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        row.message && (
                          <p className="mb-3 text-sm text-zinc-700">{row.message}</p>
                        )
                      )}
                      <div>
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
                          onClick={() => void handleReply(row.id)}
                          className="mt-2 rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                        >
                          {replyingId === row.id ? t("common.loading") : t("priceInquiry.reply")}
                        </button>
                      </div>

                      {/* Internal notes (private to gallery) */}
                      <div className="mt-4 border-t border-zinc-100 pt-3">
                        <p className="mb-2 text-xs font-medium text-zinc-500">Internal Notes</p>
                        {(notesByInquiry[row.id] ?? []).length > 0 && (
                          <ul className="mb-3 space-y-2">
                            {notesByInquiry[row.id].map((n) => (
                              <li key={n.id} className="rounded bg-amber-50 px-3 py-2 text-sm text-zinc-700">
                                <span className="text-xs text-zinc-400">{new Date(n.created_at).toLocaleString()}</span>
                                <p className="mt-0.5 whitespace-pre-wrap">{n.body}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Add internal note..."
                            value={noteText[row.id] ?? ""}
                            onChange={(e) => setNoteText((prev) => ({ ...prev, [row.id]: e.target.value }))}
                            className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm"
                          />
                          <button
                            type="button"
                            disabled={!noteText[row.id]?.trim()}
                            onClick={() => void handleAddNote(row.id)}
                            className="rounded bg-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-600 disabled:opacity-50"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {!expanded && (
                    <button
                      type="button"
                      onClick={() => void openThread(row)}
                      className="text-sm text-zinc-600 underline hover:text-zinc-900"
                    >
                      {t("priceInquiry.openThread")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {nextCursor != null && !loading && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {loadingMore ? t("common.loading") : t("priceInquiry.loadMore")}
            </button>
          </div>
        )}
      </main>
    </AuthGate>
  );
}
