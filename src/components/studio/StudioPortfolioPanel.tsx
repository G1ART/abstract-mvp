"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useT } from "@/lib/i18n/useT";
import { ArtworkCard } from "@/components/ArtworkCard";
import {
  canEditArtwork,
  deleteArtworksBatch,
  getArtworkImageUrl,
  type ArtworkWithLikes,
} from "@/lib/supabase/artworks";
import {
  filterArtworksByPersona,
  getArtworksByAllBuckets,
  getOrderedPersonaTabs,
  getPersonaCounts,
  type PersonaTab,
  type PersonaTabItem,
} from "@/lib/provenance/personaTabs";
import { getExhibitionHostCuratorLabel } from "@/lib/exhibitionCredits";
import type { ExhibitionWithCredits } from "@/lib/supabase/exhibitions";
import { updateMyProfileDetails } from "@/lib/supabase/profileDetails";
import { EmptyState } from "@/components/ds/EmptyState";

type ProfileShape = {
  id: string;
  username: string | null;
  main_role: string | null;
  roles: string[] | null;
  profile_details?: Record<string, unknown> | null;
};

type Props = {
  profile: ProfileShape;
  artworks: ArtworkWithLikes[];
  exhibitions: ExhibitionWithCredits[];
  initialTab?: PersonaTab;
  canSaveTabOrder: boolean;
  onRefresh: () => Promise<void> | void;
  onToast: (msg: string) => void;
};

const KNOWN_TABS: ReadonlySet<PersonaTab> = new Set<PersonaTab>([
  "all",
  "exhibitions",
  "CREATED",
  "OWNS",
  "INVENTORY",
  "CURATED",
]);

/**
 * Persona-aware portfolio panel used on `/my`. Bundles the persona tab row,
 * artwork/exhibition grids, bulk delete, and tab reorder so `/my/page.tsx`
 * can stay close to pure data orchestration.
 */
export function StudioPortfolioPanel({
  profile,
  artworks,
  exhibitions,
  initialTab = "all",
  canSaveTabOrder,
  onRefresh,
  onToast,
}: Props) {
  const { t } = useT();
  const [personaTab, setPersonaTab] = useState<PersonaTab>(initialTab);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tabReorderMode, setTabReorderMode] = useState(false);
  const [tabOrderDraft, setTabOrderDraft] = useState<PersonaTabItem[]>([]);
  const [tabOrderSaving, setTabOrderSaving] = useState(false);

  const roles = (profile.roles ?? []) as string[];
  const allBuckets = useMemo(
    () => getArtworksByAllBuckets(artworks, profile.id),
    [artworks, profile.id]
  );
  const displayedArtworks = useMemo<ArtworkWithLikes[]>(() => {
    if (personaTab === "exhibitions") return [];
    if (personaTab === "all")
      return [
        ...allBuckets.created,
        ...allBuckets.curated,
        ...allBuckets.exhibited,
        ...allBuckets.owns,
      ];
    return filterArtworksByPersona(artworks, profile.id, personaTab);
  }, [artworks, profile.id, personaTab, allBuckets]);

  const showExhibitionsTab = exhibitions.length > 0;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    if (selectedIds.size >= displayedArtworks.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(displayedArtworks.map((a) => a.id)));
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }
  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleting(true);
    setShowDeleteConfirm(false);
    const { okIds, failed } = await deleteArtworksBatch(ids);
    setDeleting(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    await onRefresh();
    if (failed.length === 0)
      onToast(t("my.bulkDeleteSuccess").replace("{n}", String(okIds.length)));
    else if (okIds.length > 0)
      onToast(
        t("my.bulkDeletePartial")
          .replace("{ok}", String(okIds.length))
          .replace("{fail}", String(failed.length))
      );
    else onToast(t("my.bulkDeleteFailed"));
  }
  async function handleRowDelete(id: string) {
    const { okIds, failed } = await deleteArtworksBatch([id]);
    if (okIds.length > 0) {
      onToast(t("artwork.deleted"));
      await onRefresh();
    } else if (failed.length > 0) {
      onToast(t("my.bulkDeleteFailed"));
    }
  }

  const counts = getPersonaCounts(artworks, profile.id);
  const rawSaved = profile.profile_details?.tab_order;
  const savedOrder = Array.isArray(rawSaved)
    ? (rawSaved.filter(
        (x): x is PersonaTab => typeof x === "string" && KNOWN_TABS.has(x as PersonaTab)
      ) as PersonaTab[])
    : undefined;
  const orderedTabs = getOrderedPersonaTabs(
    counts,
    exhibitions.length,
    { main_role: profile.main_role ?? null, roles },
    savedOrder
  );
  const tabLabels: Record<PersonaTab, string> = {
    all: t("profile.personaAll"),
    exhibitions: t("exhibition.myExhibitions"),
    CREATED: t("profile.personaWork"),
    OWNS: t("profile.personaCollected"),
    INVENTORY: t("profile.personaGallery"),
    CURATED: t("profile.personaCurated"),
  };

  const hasAnyContent = artworks.length > 0 || showExhibitionsTab;

  return (
    <section aria-label={t("studio.portfolio.title")} className="mb-6">
      {hasAnyContent && (
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-2">
          {tabReorderMode
            ? renderReorder()
            : renderTabs()}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">
          {personaTab === "exhibitions" ? t("exhibition.myExhibitions") : t("me.myArtworks")}
        </h2>
        {personaTab !== "exhibitions" && artworks.length > 0 && renderBulkControls()}
      </div>

      {renderBody()}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <p className="mb-4 text-zinc-800">
              {t("my.bulkSelect.confirmMessage").replace("{n}", String(selectedIds.size))}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? t("common.loading") : t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  function renderTabs() {
    return (
      <>
        {orderedTabs.map(({ tab, count }) => (
          <button
            key={tab}
            type="button"
            onClick={() => setPersonaTab(tab)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              personaTab === tab
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            {tabLabels[tab]} ({count})
          </button>
        ))}
        {canSaveTabOrder && hasAnyContent && (
          <button
            type="button"
            onClick={() => {
              setTabOrderDraft(orderedTabs);
              setTabReorderMode(true);
            }}
            className="rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
            title={t("my.reorderTabs")}
          >
            ↕
          </button>
        )}
      </>
    );
  }

  function renderReorder() {
    const list = tabOrderDraft.length > 0 ? tabOrderDraft : orderedTabs;
    return (
      <>
        {list.map(({ tab, count }, idx) => (
          <span key={tab} className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                if (idx <= 0) return;
                const next = [...list];
                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                setTabOrderDraft(next);
              }}
              className="rounded border border-zinc-300 p-0.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-40"
              disabled={idx === 0}
              aria-label={t("my.moveTabUp")}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => {
                if (idx >= list.length - 1) return;
                const next = [...list];
                [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                setTabOrderDraft(next);
              }}
              className="rounded border border-zinc-300 p-0.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-40"
              disabled={idx === list.length - 1}
              aria-label={t("my.moveTabDown")}
            >
              ↓
            </button>
            <span className="rounded bg-zinc-100 px-2 py-1 text-sm text-zinc-700">
              {tabLabels[tab]} ({count})
            </span>
          </span>
        ))}
        <button
          type="button"
          disabled={tabOrderSaving}
          onClick={async () => {
            const order = (tabOrderDraft.length > 0 ? tabOrderDraft : orderedTabs).map(
              (o) => o.tab
            );
            setTabOrderSaving(true);
            const { error: err } = await updateMyProfileDetails({ tab_order: order }, null);
            setTabOrderSaving(false);
            if (err) {
              onToast(t("common.tryAgain"));
              return;
            }
            setTabReorderMode(false);
            setTabOrderDraft([]);
            await onRefresh();
          }}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {tabOrderSaving ? t("common.loading") : t("common.save")}
        </button>
        <button
          type="button"
          onClick={() => {
            setTabReorderMode(false);
            setTabOrderDraft([]);
          }}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          {t("common.cancel")}
        </button>
      </>
    );
  }

  function renderBulkControls() {
    if (!selectMode) {
      return (
        <button
          type="button"
          onClick={() => setSelectMode(true)}
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          {t("my.bulkSelect.select")}
        </button>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={selectAll}
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          {selectedIds.size >= displayedArtworks.length
            ? t("my.bulkSelect.clear")
            : t("my.bulkSelect.selectAll")}
        </button>
        <button
          type="button"
          onClick={clearSelection}
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          {t("my.bulkSelect.clear")}
        </button>
        <button
          type="button"
          disabled={selectedIds.size === 0 || deleting}
          onClick={() => setShowDeleteConfirm(true)}
          className="rounded-lg border border-red-500 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {t("my.bulkSelect.deleteSelected")} ({selectedIds.size})
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectMode(false);
            setSelectedIds(new Set());
          }}
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          {t("common.cancel")}
        </button>
      </div>
    );
  }

  function renderBody() {
    if (personaTab === "exhibitions") {
      return (
        <ul className="space-y-2">
          {exhibitions.map((ex) => {
            const firstCover = (ex.cover_image_paths ?? [])[0];
            return (
              <li key={ex.id}>
                <Link
                  href={`/my/exhibitions/${ex.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
                >
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100">
                    {firstCover ? (
                      <Image
                        src={getArtworkImageUrl(firstCover, "thumb")}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-400">·</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900">{ex.title}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {ex.start_date && ex.end_date
                        ? `${ex.start_date} – ${ex.end_date}`
                        : ex.start_date ?? ex.status}
                      {" · "}
                      {getExhibitionHostCuratorLabel(ex, t)}
                    </p>
                    <p className="text-[11px] text-zinc-400">{t("exhibition.works")} →</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      );
    }

    if (personaTab === "all") {
      const { created, curated, exhibited, owns } = allBuckets;
      const hasAny = created.length + curated.length + exhibited.length + owns.length > 0;
      if (!hasAny) {
        return (
          <EmptyState
            title={t("me.noWorks")}
            action={{ label: t("me.uploadFirst"), href: "/upload" }}
          />
        );
      }
      const sections = [
        { key: "created", list: created, label: t("profile.personaWork") },
        { key: "curated", list: curated, label: t("profile.personaCurated") },
        { key: "exhibited", list: exhibited, label: t("profile.bucketExhibited") },
        { key: "owns", list: owns, label: t("profile.personaCollected") },
      ].filter((s) => s.list.length > 0);
      return (
        <div className="space-y-8">
          {sections.map(({ key, list, label }) => (
            <section key={key}>
              <h3 className="mb-3 text-sm font-medium text-zinc-500">
                {label} ({list.length})
              </h3>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((a) => renderCard(a))}
              </div>
            </section>
          ))}
        </div>
      );
    }

    if (displayedArtworks.length === 0) {
      return (
        <EmptyState
          title={t("me.noWorks")}
          action={{ label: t("me.uploadFirst"), href: "/upload" }}
        />
      );
    }

    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {displayedArtworks.map((a) => renderCard(a))}
      </div>
    );
  }

  function renderCard(artwork: ArtworkWithLikes) {
    return (
      <div key={artwork.id} className="relative">
        {selectMode && (
          <div className="absolute left-2 top-2 z-10">
            <input
              type="checkbox"
              checked={selectedIds.has(artwork.id)}
              onChange={() => toggleSelect(artwork.id)}
              className="h-5 w-5 rounded border-zinc-300"
              aria-label={t("my.bulkSelect.select")}
            />
          </div>
        )}
        <ArtworkCard
          artwork={artwork}
          likesCount={artwork.likes_count ?? 0}
          showEdit={!selectMode && canEditArtwork(artwork, profile.id)}
          showDelete={!selectMode}
          onDelete={handleRowDelete}
        />
      </div>
    );
  }
}
