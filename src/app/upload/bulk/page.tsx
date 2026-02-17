"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  attachArtworkImage,
  createDraftArtwork,
  deleteArtwork,
  deleteDraftArtworks,
  listMyDraftArtworks,
  publishArtworks,
  publishArtworksWithProvenance,
  updateArtwork,
  validatePublish,
  type ArtworkWithLikes,
} from "@/lib/supabase/artworks";
import { getSession } from "@/lib/supabase/auth";
import { removeStorageFile, uploadArtworkImage } from "@/lib/supabase/storage";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";
import { searchPeople } from "@/lib/supabase/artists";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";

type IntentType = "CREATED" | "OWNS" | "INVENTORY" | "CURATED";

const INTENTS: { value: IntentType; label: string }[] = [
  { value: "CREATED", label: "My work" },
  { value: "OWNS", label: "Collected work" },
  { value: "INVENTORY", label: "Gallery (inc. inventory)" },
  { value: "CURATED", label: "Curated/Exhibited" },
];

type ArtistOption = { id: string; username: string | null; display_name: string | null };

const OWNERSHIP_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "owned", label: "Owned" },
  { value: "sold", label: "Sold" },
  { value: "not_for_sale", label: "Not for sale" },
] as const;

function deriveTitle(filename: string): string {
  const base = filename.includes(".") ? filename.slice(0, filename.lastIndexOf(".")) : filename;
  return base.replace(/[-_]/g, " ").trim() || "Untitled";
}

export default function BulkUploadPage() {
  const { t } = useT();
  const [drafts, setDrafts] = useState<ArtworkWithLikes[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadCurrent, setUploadCurrent] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(true);
  const [pendingFiles, setPendingFiles] = useState<{ id: string; file: File }[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Persona / intent
  const [intent, setIntent] = useState<IntentType | null>(null);
  const [artistSearch, setArtistSearch] = useState("");
  const [artistResults, setArtistResults] = useState<ArtistOption[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<ArtistOption | null>(null);
  const [searching, setSearching] = useState(false);
  const [useExternalArtist, setUseExternalArtist] = useState(false);
  const [externalArtistName, setExternalArtistName] = useState("");
  const [externalArtistEmail, setExternalArtistEmail] = useState("");

  const needsAttribution = intent !== null && intent !== "CREATED";

  const doSearchArtists = useCallback(async () => {
    const q = artistSearch.trim();
    if (!q || q.length < 2) {
      setArtistResults([]);
      return;
    }
    setSearching(true);
    const { data } = await searchPeople({ q, roles: ["artist"], limit: 10 });
    setArtistResults((data ?? []).map((p) => ({ id: p.id, username: p.username, display_name: p.display_name })));
    setSearching(false);
  }, [artistSearch]);

  useEffect(() => {
    const t = setTimeout(doSearchArtists, 300);
    return () => clearTimeout(t);
  }, [artistSearch, doSearchArtists]);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    const { data } = await listMyDraftArtworks({ limit: 100 });
    setDrafts(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  function addPendingFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) {
      setUploadError("Please select image files (JPG, PNG, WebP)");
      return;
    }
    setUploadError(null);
    setPendingFiles((prev) => [
      ...prev,
      ...arr.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
  }

  function removePendingFile(id: string) {
    setPendingFiles((prev) => prev.filter((p) => p.id !== id));
  }

  function clearPendingFiles() {
    setPendingFiles([]);
  }

  async function startUpload() {
    if (pendingFiles.length === 0) return;
    const { data: { session } } = await getSession();
    if (!session?.user?.id) {
      setUploadError("Not authenticated");
      return;
    }
    const userId = session.user.id;
    setUploadError(null);
    setUploading(true);
    setUploadTotal(pendingFiles.length);
    setUploadCurrent(0);
    const queue = [...pendingFiles];
    setPendingFiles([]);

    for (let i = 0; i < queue.length; i++) {
      const { file } = queue[i];
      setUploadCurrent(i + 1);
      const title = deriveTitle(file.name);
      let artworkId: string | null = null;
      let storagePath: string | null = null;
      try {
        const { data: id, error: createErr } = await createDraftArtwork({ title });
        if (createErr || !id) {
          setUploadError(createErr instanceof Error ? createErr.message : "Failed to create draft");
          continue;
        }
        artworkId = id;
        storagePath = await uploadArtworkImage(file, userId);
        const { error: attachErr } = await attachArtworkImage(artworkId, storagePath);
        if (attachErr) throw attachErr;
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
        if (storagePath) {
          try { await removeStorageFile(storagePath); } catch {}
        }
        if (artworkId) {
          try { await deleteArtwork(artworkId); } catch {}
        }
      }
    }
    setUploading(false);
    await fetchDrafts();
  }

  async function handleDeleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setDeleting(true);
    await deleteDraftArtworks(ids);
    setDeleting(false);
    setSelected(new Set());
    await fetchDrafts();
    setToast(t("bulk.deleted"));
    setTimeout(() => setToast(null), 2000);
  }

  async function handleDeleteAll() {
    const ids = drafts.map((d) => d.id);
    if (ids.length === 0) return;
    setDeleting(true);
    await deleteDraftArtworks(ids);
    setDeleting(false);
    setSelected(new Set());
    await fetchDrafts();
    setToast(t("bulk.deleted"));
    setTimeout(() => setToast(null), 2000);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === drafts.length) setSelected(new Set());
    else setSelected(new Set(drafts.map((d) => d.id)));
  }

  async function applyToDrafts(
    ids: string[],
    partial: { year?: number; medium?: string; ownership_status?: string; pricing_mode?: "fixed" | "inquire"; is_price_public?: boolean }
  ) {
    for (const id of ids) {
      await updateArtwork(id, partial);
    }
    await fetchDrafts();
  }

  async function handleApply(field: string, value: unknown) {
    const ids = selected.size > 0 ? Array.from(selected) : drafts.map((d) => d.id);
    if (ids.length === 0) return;
    const payload: Record<string, unknown> = {};
    if (field === "year") payload.year = typeof value === "number" ? value : parseInt(String(value), 10) || null;
    else if (field === "medium") payload.medium = String(value ?? "");
    else if (field === "ownership_status") payload.ownership_status = String(value ?? "");
    else if (field === "pricing_mode") payload.pricing_mode = value as "fixed" | "inquire";
    else if (field === "is_price_public") payload.is_price_public = Boolean(value);
    await applyToDrafts(ids, payload as Parameters<typeof applyToDrafts>[1]);
  }

  async function handlePublish() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const toPublish = drafts.filter((d) => ids.includes(d.id));
    const invalid = toPublish.filter((d) => !validatePublish(d).ok);
    if (invalid.length > 0) return;
    if (needsAttribution) {
      if (useExternalArtist) {
        if (!externalArtistName.trim()) {
          setToast(t("upload.externalArtistNamePlaceholder") || "Artist name required");
          setTimeout(() => setToast(null), 2000);
          return;
        }
      } else if (!selectedArtist) {
        setToast(t("upload.linkArtist") || "Please select an artist");
        setTimeout(() => setToast(null), 2000);
        return;
      }
    }
    setPublishing(true);
    try {
      if (intent && needsAttribution) {
        const { error } = await publishArtworksWithProvenance(ids, {
          intent,
          artistProfileId: selectedArtist?.id ?? null,
          externalArtistDisplayName: useExternalArtist ? externalArtistName.trim() : null,
          externalArtistEmail: useExternalArtist ? externalArtistEmail.trim() || null : null,
        });
        if (error) {
          setToast(error instanceof Error ? error.message : "Publish failed");
          setTimeout(() => setToast(null), 3000);
          return;
        }
      } else {
        const { error } = await publishArtworks(ids);
        if (error) {
          setToast(error instanceof Error ? error.message : "Publish failed");
          setTimeout(() => setToast(null), 3000);
          return;
        }
      }
      setSelected(new Set());
      await fetchDrafts();
    } finally {
      setPublishing(false);
    }
  }

  async function updateDraftField(id: string, field: string, value: unknown) {
    const payload: Record<string, unknown> = {};
    if (field === "title") payload.title = String(value ?? "");
    else if (field === "year") payload.year = typeof value === "number" ? value : (parseInt(String(value), 10) || null);
    else if (field === "medium") payload.medium = String(value ?? "");
    else if (field === "ownership_status") payload.ownership_status = String(value ?? "");
    else if (field === "pricing_mode") payload.pricing_mode = value as "fixed" | "inquire" | null;
    await updateArtwork(id, payload as Parameters<typeof updateArtwork>[1]);
    await fetchDrafts();
  }

  const readyCount = drafts.filter((d) => validatePublish(d).ok).length;
  const selectedIds = Array.from(selected);
  const selectedReady = drafts.filter((d) => selectedIds.includes(d.id) && validatePublish(d).ok).length;
  const canPublishSelected = selectedIds.length > 0 && selectedReady === selectedIds.length;

  const showIntent = intent === null;
  const showAttribution = intent !== null && needsAttribution && !selectedArtist && !(useExternalArtist && externalArtistName.trim());
  const showMain = intent !== null && (!needsAttribution || selectedArtist !== null || (useExternalArtist && externalArtistName.trim()));

  return (
    <AuthGate>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t("bulk.title")}</h1>
          <Link href="/upload" className="text-sm text-zinc-600 hover:text-zinc-900">
            ← Single upload
          </Link>
        </div>

        {/* Step: Intent */}
        {showIntent && (
          <div className="mb-8 space-y-4">
            <p className="text-sm text-zinc-600">{t("bulk.intentHint")}</p>
            <div className="grid gap-3">
              {INTENTS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setIntent(opt.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left font-medium text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Attribution (OWNS, INVENTORY, CURATED) */}
        {showAttribution && (
          <div className="mb-8 space-y-4">
            <p className="text-sm text-zinc-600">{t("upload.linkArtist")}</p>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium">{t("upload.searchArtist")}</label>
              <button
                type="button"
                onClick={() => {
                  setUseExternalArtist(!useExternalArtist);
                  if (!useExternalArtist) {
                    setSelectedArtist(null);
                    setArtistSearch("");
                    setArtistResults([]);
                  } else {
                    setExternalArtistName("");
                    setExternalArtistEmail("");
                  }
                }}
                className="text-sm text-zinc-600 underline hover:text-zinc-900"
              >
                {useExternalArtist ? t("upload.searchArtist") : t("upload.inviteByEmail")}
              </button>
            </div>
            {useExternalArtist ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={externalArtistName}
                  onChange={(e) => setExternalArtistName(e.target.value)}
                  placeholder={t("upload.externalArtistNamePlaceholder")}
                  className="w-full max-w-md rounded border border-zinc-300 px-3 py-2 text-sm"
                />
                <input
                  type="email"
                  value={externalArtistEmail}
                  onChange={(e) => setExternalArtistEmail(e.target.value)}
                  placeholder={t("upload.externalArtistEmailPlaceholder")}
                  className="w-full max-w-md rounded border border-zinc-300 px-3 py-2 text-sm"
                />
                <p className="text-xs text-zinc-500">{t("upload.externalArtistEmailHint")}</p>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={artistSearch}
                  onChange={(e) => setArtistSearch(e.target.value)}
                  placeholder={t("upload.artistSearchPlaceholder")}
                  className="w-full max-w-md rounded border border-zinc-300 px-3 py-2 text-sm"
                />
                {searching && <p className="text-sm text-zinc-500">{t("artists.loading")}</p>}
                {artistResults.length > 0 && (
                  <ul className="max-w-md rounded border border-zinc-200 bg-white">
                    {artistResults.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedArtist(a);
                            setArtistResults([]);
                            setArtistSearch("");
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-50"
                        >
                          {a.display_name || a.username || a.id}
                          {a.username && <span className="ml-2 text-zinc-500">@{a.username}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setIntent(null);
                  setSelectedArtist(null);
                  setUseExternalArtist(false);
                  setExternalArtistName("");
                  setExternalArtistEmail("");
                  setArtistSearch("");
                  setArtistResults([]);
                }}
                className="rounded border border-zinc-300 px-4 py-2 text-sm"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* Main bulk UI */}
        {showMain && (
          <>
        {/* Tips accordion */}
        <div className="mb-6 rounded-lg border border-zinc-200">
          <button
            type="button"
            onClick={() => setTipsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-zinc-900"
          >
            {t("bulk.tipsTitle")}
            <span className="text-zinc-500">{tipsOpen ? "−" : "+"}</span>
          </button>
          {tipsOpen && (
            <div className="border-t border-zinc-200 px-4 py-3 text-sm text-zinc-600 space-y-1">
              <p>• {t("bulk.tip1")}</p>
              <p>• {t("bulk.tip2")}</p>
              <p>• {t("bulk.tip3")}</p>
            </div>
          )}
        </div>

        {/* Dropzone */}
        <div
          className="mb-6 cursor-pointer rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center hover:border-zinc-400"
          onClick={() => document.getElementById("bulk-file-input")?.click()}
          onDrop={(e) => {
            e.preventDefault();
            addPendingFiles(e.dataTransfer.files);
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          <input
            id="bulk-file-input"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => addPendingFiles(e.target.files)}
            disabled={uploading}
          />
          <p className="text-sm text-zinc-600">{t("bulk.dropzone")}</p>
        </div>

        {/* Pending files */}
        {pendingFiles.length > 0 && !uploading && (
          <div className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="mb-2 text-sm font-medium">{t("bulk.pendingFiles")} ({pendingFiles.length})</h3>
            <div className="mb-3 flex flex-wrap gap-2">
              {pendingFiles.map(({ id, file }) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-sm text-zinc-700"
                >
                  {file.name}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removePendingFile(id); }}
                    className="text-red-600 hover:text-red-800"
                    aria-label={t("bulk.removePending")}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={startUpload}
                className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                {t("bulk.startUpload")} ({pendingFiles.length})
              </button>
              <button
                type="button"
                onClick={clearPendingFiles}
                className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {uploading && (
          <p className="mb-4 text-sm text-zinc-600">
            {t("bulk.uploadProgress")
              .replace("{current}", String(uploadCurrent))
              .replace("{total}", String(uploadTotal))}
          </p>
        )}
        {uploadError && (
          <p className="mb-4 text-sm text-red-600">
            {t("bulk.uploadError").replace("{message}", uploadError)}
          </p>
        )}
        {!uploading && uploadTotal > 0 && (
          <p className="mb-4 text-sm text-green-600">
            {t("bulk.uploadDone").replace("{total}", String(uploadTotal))}
          </p>
        )}

        {/* Apply-to-all */}
        {drafts.length > 0 && (
          <div className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="mb-3 text-sm font-medium">{t("bulk.applyToSelected")} / {t("bulk.applyToAll")}</h3>
            <div className="flex flex-wrap gap-3">
              <input
                type="number"
                placeholder={t("bulk.year")}
                className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm"
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) handleApply("year", v);
                }}
              />
              <input
                type="text"
                placeholder={t("bulk.medium")}
                className="w-40 rounded border border-zinc-300 px-2 py-1 text-sm"
                onBlur={(e) => handleApply("medium", e.target.value)}
              />
              <select
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
                onChange={(e) => handleApply("ownership_status", e.target.value)}
              >
                <option value="">{t("bulk.ownershipStatus")}</option>
                {OWNERSHIP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
                onChange={(e) => handleApply("pricing_mode", e.target.value as "fixed" | "inquire")}
              >
                <option value="">{t("bulk.pricingMode")}</option>
                <option value="inquire">{t("bulk.inquire")}</option>
                <option value="fixed">{t("bulk.fixed")}</option>
              </select>
            </div>
          </div>
        )}

        {/* Publish + Delete panel */}
        {drafts.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3">
            <span className="text-sm">
              {t("bulk.readyToPublish")
                .replace("{ready}", String(selectedIds.length > 0 ? selectedReady : readyCount))
                .replace("{total}", String(selectedIds.length > 0 ? selectedIds.length : drafts.length))}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={selectedIds.length === 0 || deleting}
                className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {t("bulk.deleteSelected")}
              </button>
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={deleting}
                className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {t("bulk.deleteAll")}
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={!canPublishSelected || publishing}
                className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {t("bulk.publishSelected")}
              </button>
            </div>
          </div>
        )}

        {toast && (
          <div className="fixed bottom-4 right-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        )}

        {/* Draft list */}
        {loading ? (
          <p className="text-zinc-600">{t("common.loading")}</p>
        ) : drafts.length === 0 ? (
          <p className="py-12 text-center text-zinc-600">{t("bulk.noDrafts")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="p-2 text-left">
                    <input
                      type="checkbox"
                      checked={drafts.length > 0 && selected.size === drafts.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-2 text-left"> </th>
                  <th className="p-2 text-left">Title</th>
                  <th className="p-2 text-left">{t("bulk.year")}</th>
                  <th className="p-2 text-left">{t("bulk.medium")}</th>
                  <th className="p-2 text-left">{t("bulk.ownershipStatus")}</th>
                  <th className="p-2 text-left">{t("bulk.pricingMode")}</th>
                  <th className="p-2 text-left">{t("bulk.status")}</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => {
                  const val = validatePublish(d);
                  const img = (d.artwork_images ?? [])[0];
                  const thumb = img ? getArtworkImageUrl(img.storage_path, "thumb") : null;
                  return (
                    <tr key={d.id} className="border-b border-zinc-100">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(d.id)}
                          onChange={() => toggleSelect(d.id)}
                        />
                      </td>
                      <td className="p-2">
                        <div className="h-12 w-12 overflow-hidden rounded bg-zinc-200">
                          {thumb ? (
                            <Image src={thumb} alt="" width={48} height={48} sizes="48px" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-zinc-400 text-xs">—</div>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          defaultValue={d.title ?? ""}
                          className="w-full rounded border border-zinc-300 px-2 py-1"
                          onBlur={(e) => updateDraftField(d.id, "title", e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          defaultValue={d.year ?? ""}
                          placeholder="—"
                          className="w-20 rounded border border-zinc-300 px-2 py-1"
                          onBlur={(e) => updateDraftField(d.id, "year", e.target.value ? parseInt(e.target.value, 10) : null)}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          defaultValue={d.medium ?? ""}
                          placeholder="—"
                          className="w-32 rounded border border-zinc-300 px-2 py-1"
                          onBlur={(e) => updateDraftField(d.id, "medium", e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <select
                          defaultValue={d.ownership_status ?? ""}
                          className="rounded border border-zinc-300 px-2 py-1"
                          onChange={(e) => updateDraftField(d.id, "ownership_status", e.target.value || null)}
                        >
                          <option value="">—</option>
                          {OWNERSHIP_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <select
                          defaultValue={d.pricing_mode ?? ""}
                          className="rounded border border-zinc-300 px-2 py-1"
                          onChange={(e) => updateDraftField(d.id, "pricing_mode", e.target.value || null)}
                        >
                          <option value="">—</option>
                          <option value="inquire">{t("bulk.inquire")}</option>
                          <option value="fixed">{t("bulk.fixed")}</option>
                        </select>
                      </td>
                      <td className="p-2">
                        {val.ok ? (
                          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">{t("bulk.statusReady")}</span>
                        ) : (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800" title={val.missing.join(", ")}>
                            {t("bulk.missing")}: {val.missing.join(", ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
          </>
        )}
      </main>
    </AuthGate>
  );
}
