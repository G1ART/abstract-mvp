"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { ArtworkCard } from "@/components/ArtworkCard";
import { useT } from "@/lib/i18n/useT";
import { getSession } from "@/lib/supabase/auth";
import {
  type ArtworkCursor,
  type ArtworkWithLikes,
  type MyLibrarySort,
  listMyArtworksForLibrary,
} from "@/lib/supabase/artworks";
import { generateCsv, downloadCsv } from "@/lib/csv/parse";
import { useActingAs } from "@/context/ActingAsContext";

const OWNERSHIP_VALUES = ["available", "owned", "sold", "not_for_sale"] as const;

// Map raw enum values to i18n keys so the filter dropdown shows
// localized labels instead of raw strings like `not_for_sale`. Keys are
// shared with the upload/bulk forms (single source of truth in
// `src/lib/i18n/messages.ts`).
const OWNERSHIP_LABEL_KEY: Record<(typeof OWNERSHIP_VALUES)[number], string> = {
  available: "upload.ownershipAvailable",
  owned: "upload.ownershipOwned",
  sold: "upload.ownershipSold",
  not_for_sale: "upload.ownershipNotForSale",
};

export default function MyLibraryPage() {
  const { t } = useT();
  const { actingAsProfileId } = useActingAs();
  const [items, setItems] = useState<ArtworkWithLikes[]>([]);
  const [nextCursor, setNextCursor] = useState<ArtworkCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [visibility, setVisibility] = useState<"all" | "public" | "draft">("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [sort, setSort] = useState<MyLibrarySort>("created_at");
  const [ownershipStatus, setOwnershipStatus] = useState("");
  const [pricingMode, setPricingMode] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [createdByMe, setCreatedByMe] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    const tmr = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(tmr);
  }, [search]);

  useEffect(() => {
    void getSession().then(({ data }) => setMyUserId(data.session?.user?.id ?? null));
  }, []);

  const loadPage = useCallback(
    async (cursor: ArtworkCursor | null, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      const { data, nextCursor: nc, error } = await listMyArtworksForLibrary({
        limit: 40,
        cursor,
        visibility,
        search: searchDebounced,
        sort,
        ownershipStatus: ownershipStatus || null,
        pricingMode: pricingMode || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : null,
        createdBy: createdByMe && myUserId ? myUserId : null,
        // Acting-as: filter to the principal's artworks instead of the
        // operator's. RLS already permits the read for active delegate
        // writers; this just aligns the UI with the principal scope.
        forProfileId: actingAsProfileId ?? null,
      });
      if (error) {
        if (append) setLoadingMore(false);
        else setLoading(false);
        return;
      }
      if (append) {
        setItems((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          const add = (data ?? []).filter((a) => !seen.has(a.id));
          return [...prev, ...add];
        });
      } else {
        setItems(data ?? []);
      }
      setNextCursor(nc);
      if (append) setLoadingMore(false);
      else setLoading(false);
    },
    [
      visibility,
      searchDebounced,
      sort,
      ownershipStatus,
      pricingMode,
      dateFrom,
      dateTo,
      createdByMe,
      myUserId,
      actingAsProfileId,
    ]
  );

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      void loadPage(null, false);
    });
    return () => cancelAnimationFrame(t);
  }, [loadPage]);

  return (
    <AuthGate>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link href="/my" className="mb-4 inline-block text-sm text-zinc-600 hover:text-zinc-900">
          ← {t("library.back")}
        </Link>
        <div className="mb-1 flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">{t("library.title")}</h1>
          <div className="flex gap-2">
            <Link href="/my/library/import" className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
              Import CSV
            </Link>
            <button
              type="button"
              onClick={() => {
                const headers = ["title", "year", "medium", "size", "size_unit", "ownership_status", "pricing_mode", "visibility"];
                const rows = items.map((a) => [
                  a.title ?? "",
                  String(a.year ?? ""),
                  a.medium ?? "",
                  a.size ?? "",
                  String((a as Record<string, unknown>).size_unit ?? ""),
                  a.ownership_status ?? "",
                  a.pricing_mode ?? "",
                  a.visibility ?? "",
                ]);
                downloadCsv("library_export.csv", generateCsv(headers, rows));
              }}
              disabled={items.length === 0}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>
        <p className="mb-6 text-sm text-zinc-600">{t("library.hint")}</p>

        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex flex-wrap gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("library.search")}
              className="min-w-[200px] flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
            />
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "all" | "public" | "draft")}
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="all">{t("library.visibilityAll")}</option>
              <option value="public">{t("library.visibilityPublic")}</option>
              <option value="draft">{t("library.visibilityDraft")}</option>
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as MyLibrarySort)}
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="created_at">{t("library.sortCreated")}</option>
              <option value="likes">{t("library.sortLikes")}</option>
              <option value="artist_sort">{t("library.sortArtistOrder")}</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={ownershipStatus}
              onChange={(e) => setOwnershipStatus(e.target.value)}
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">— {t("bulk.ownershipStatus")} —</option>
              {OWNERSHIP_VALUES.map((v) => (
                <option key={v} value={v}>
                  {t(OWNERSHIP_LABEL_KEY[v])}
                </option>
              ))}
            </select>
            <select
              value={pricingMode}
              onChange={(e) => setPricingMode(e.target.value)}
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">— {t("bulk.pricingMode")} —</option>
              <option value="inquire">{t("bulk.inquire")}</option>
              <option value="fixed">{t("bulk.fixed")}</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={createdByMe}
                onChange={(e) => setCreatedByMe(e.target.checked)}
              />
              {t("library.createdByMe")}
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              {t("library.createdFrom")}
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              {t("library.createdTo")}
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
              />
            </label>
          </div>
        </div>

        {loading ? (
          <p className="text-zinc-500">{t("common.loading")}</p>
        ) : items.length === 0 ? (
          <p className="text-zinc-600">{t("library.empty")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((a) => (
              <ArtworkCard
                key={a.id}
                artwork={a}
                likesCount={a.likes_count ?? 0}
                showEdit
                viewerId={myUserId}
              />
            ))}
          </div>
        )}

        {nextCursor != null && !loading && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadPage(nextCursor, true)}
              className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {loadingMore ? t("common.loading") : t("library.loadMore")}
            </button>
          </div>
        )}
      </main>
    </AuthGate>
  );
}
