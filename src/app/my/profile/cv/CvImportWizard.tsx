"use client";

/**
 * CV Import Wizard — Profile Materials P6.2.
 *
 * Four states:
 *   1. "idle"        – two input options (URL / file). Cancel button hides
 *                      the wizard back into the editor surface.
 *   2. "running"     – AI route in flight; rotating status copy so the
 *                      user knows progress without a fake progress bar.
 *   3. "preview"     – LLM result shown by section. Each entry is
 *                      editable (category dropdown, inline fields,
 *                      remove). Footer toggles add-vs-replace mode.
 *   4. "saving"      – RPC write in flight.
 *
 * After a successful save the wizard collapses back into the import
 * card and the editor is told to refresh from the saved baseline.
 *
 * The wizard NEVER writes to the CV columns directly — the parent
 * `CvEditorClient` does that via the existing `updateMyProfileCv` RPC
 * once the user confirms. This keeps the LLM output strictly preview
 * until the human approves it.
 */

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/useT";
import { aiApi } from "@/lib/ai/browser";
import type { CvImportCategory, CvImportEntry, CvImportResult } from "@/lib/ai/types";
import type { CvEntry } from "@/lib/supabase/profiles";
import type { ProfileCvSlice } from "@/lib/supabase/profileCv";
import { findSimilarIndex } from "@/lib/cv/normalize";
import { fileToBase64, renderPdfPagesToPng } from "@/lib/cv/pdfImages.client";

type WizardState = "idle" | "running" | "preview" | "saving";
type MergeMode = "add" | "replace";

type Props = {
  /** Existing CV — used to render a "{count} entries will be removed" warning
   *  when the user selects "replace" mode, and to compute counts after merge. */
  baseline: ProfileCvSlice;
  /** Locale label forwarded to the AI route. */
  locale: "ko" | "en";
  /** Called when the user confirms a preview. The parent merges into
   *  its own state and persists via the editor's save bar (or directly
   *  via the RPC, depending on the implementation). */
  onApply: (next: ProfileCvSlice, meta: { mode: MergeMode; appliedCount: number }) => void;
};

const RUNNING_STATUS_KEYS = [
  "cv.import.statusFetching",
  "cv.import.statusExtracting",
  "cv.import.statusClassifying",
  "cv.import.statusFinishing",
] as const;

const CATEGORY_LABEL_KEY: Record<CvImportCategory, string> = {
  education: "cv.editor.education",
  exhibitions: "cv.editor.exhibitions",
  awards: "cv.editor.awards",
  residencies: "cv.editor.residencies",
};

/* -------------------------------------------------------------------------- */

export function CvImportWizard({ baseline, locale, onApply }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<WizardState>("idle");
  const [statusIdx, setStatusIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Inputs
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<{
    name: string;
    /** "pdf" / "docx" → text extractor on server.
     *  "image" → vision branch directly (jpg/png/webp resume photo). */
    kind: "pdf" | "docx" | "image";
    /** When kind === "image" we need the MIME so the multimodal call
     *  can build the right `data:` URL. */
    imageMime?: string;
    base64: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [scanFallbackBanner, setScanFallbackBanner] = useState<{
    pageCount: number;
  } | null>(null);

  // Result state
  const [entries, setEntries] = useState<CvImportEntry[]>([]);
  const [skip, setSkip] = useState<Set<number>>(() => new Set());
  const [confidence, setConfidence] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [mode, setMode] = useState<MergeMode>("add");

  const baselineCount = useMemo(
    () =>
      baseline.education.length +
      baseline.exhibitions.length +
      baseline.awards.length +
      baseline.residencies.length,
    [baseline],
  );

  /* --------------------------------- input -------------------------------- */

  const onPickFile = useCallback(async (f: File) => {
    setError(null);
    setScanFallbackBanner(null);
    const lower = f.name.toLowerCase();
    let kind: "pdf" | "docx" | "image" | null = null;
    let imageMime: string | undefined;
    if (lower.endsWith(".pdf") || f.type === "application/pdf") {
      kind = "pdf";
    } else if (
      lower.endsWith(".docx") ||
      f.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      kind = "docx";
    } else if (
      f.type === "image/png" ||
      f.type === "image/jpeg" ||
      f.type === "image/webp" ||
      lower.endsWith(".png") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".webp")
    ) {
      kind = "image";
      imageMime =
        f.type === "image/png" || f.type === "image/jpeg" || f.type === "image/webp"
          ? f.type
          : lower.endsWith(".png")
            ? "image/png"
            : lower.endsWith(".webp")
              ? "image/webp"
              : "image/jpeg";
    }
    if (!kind) {
      setError("cv.import.errorGeneric");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("cv.import.errorTooLarge");
      return;
    }
    const base64 = await fileToBase64(f);
    setFile({ name: f.name, kind, imageMime, base64 });
    setUrl("");
  }, []);

  const onClearFile = useCallback(() => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  /* --------------------------------- run ---------------------------------- */

  const runImport = useCallback(async () => {
    if (state === "running") return;
    if (!url && !file) return;
    setError(null);
    setScanFallbackBanner(null);
    setState("running");
    setStatusIdx(0);
    const tickId = window.setInterval(() => {
      setStatusIdx((i) => Math.min(i + 1, RUNNING_STATUS_KEYS.length - 1));
    }, 1500);

    // First call: dispatch by file kind. Image goes straight to the
    // vision branch; pdf/docx/url use the text branch and may fall
    // back to vision client-side.
    let result: CvImportResult & { extractError?: string; visionFallback?: boolean };
    try {
      if (file?.kind === "image") {
        result = (await aiApi.cvImport({
          url: null,
          file: null,
          images: [{ mime: file.imageMime ?? "image/png", base64: file.base64 }],
          imageSourceLabel: file.name,
          locale,
        })) as CvImportResult & { extractError?: string; visionFallback?: boolean };
      } else {
        // In this branch the discriminant above already narrowed `file`
        // away from `"image"`, so `file.kind` is `"pdf" | "docx"`.
        result = (await aiApi.cvImport({
          url: file ? null : url,
          file: file
            ? { kind: file.kind as "pdf" | "docx", name: file.name, base64: file.base64 }
            : null,
          locale,
        })) as CvImportResult & { extractError?: string; visionFallback?: boolean };
      }

      // Vision fallback: server told us this PDF has no extractable
      // text, so we re-render the same file as page bitmaps and POST
      // again with `images[]`.
      if (
        result.degraded &&
        result.visionFallback === true &&
        file?.kind === "pdf"
      ) {
        try {
          const rendered = await renderPdfPagesToPng(file.base64, { maxPages: 6 });
          if (rendered.pages.length === 0) {
            throw new Error("no_pages");
          }
          setScanFallbackBanner({ pageCount: rendered.pages.length });
          result = (await aiApi.cvImport({
            url: null,
            file: null,
            images: rendered.pages,
            imageSourceLabel: `${file.name} (p1–${rendered.pages.length})`,
            locale,
          })) as CvImportResult & { extractError?: string; visionFallback?: boolean };
        } catch {
          window.clearInterval(tickId);
          setState("idle");
          setError("cv.import.errorRender");
          return;
        }
      }
    } finally {
      window.clearInterval(tickId);
    }

    if (result.degraded || result.reason) {
      setState("idle");
      setError(degradedKeyFor(result));
      return;
    }
    const incoming = result.entries ?? [];
    setEntries(incoming);
    // Default: every entry that is "similar to" an existing CV row is
    // skipped so we never silently double-write history. The user can
    // bring any of them back individually or via "include all".
    const auto = new Set<number>();
    for (let i = 0; i < incoming.length; i += 1) {
      const e = incoming[i];
      const baselineSlice = baseline[e.category as keyof ProfileCvSlice] ?? [];
      if (findSimilarIndex(e.category, e.fields, baselineSlice) >= 0) auto.add(i);
    }
    setSkip(auto);
    setConfidence(typeof result.confidence === "number" ? result.confidence : null);
    setNote(result.note ?? null);
    setState("preview");
  }, [state, url, file, locale, baseline]);

  // arrayBufferToBase64 is no longer needed — `fileToBase64` handles
  // the chunked browser-safe encoding for both pdf/docx and image
  // pickers. The helper sits in `pdfImages.client.ts` so it can be
  // shared between the wizard and the PDF page renderer.

  /* ------------------------------ preview edit ---------------------------- */

  const updateEntryFields = useCallback((idx: number, fields: Record<string, string>) => {
    setEntries((list) => {
      const next = list.slice();
      next[idx] = { ...next[idx], fields };
      return next;
    });
  }, []);
  const updateEntryCategory = useCallback((idx: number, category: CvImportCategory) => {
    setEntries((list) => {
      const next = list.slice();
      next[idx] = { ...next[idx], category };
      return next;
    });
  }, []);
  const removeEntry = useCallback((idx: number) => {
    setEntries((list) => list.filter((_, i) => i !== idx));
    // Re-base the skip set: every index strictly above `idx` shifts down by one.
    setSkip((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i === idx) continue;
        next.add(i > idx ? i - 1 : i);
      }
      return next;
    });
  }, []);
  const toggleSkip = useCallback((idx: number) => {
    setSkip((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  /* ----------------------------------- save ------------------------------- */

  const confirm = useCallback(() => {
    setState("saving");
    const grouped: ProfileCvSlice = {
      education: [],
      exhibitions: [],
      awards: [],
      residencies: [],
    };
    for (let i = 0; i < entries.length; i += 1) {
      if (skip.has(i)) continue;
      const e = entries[i];
      if (Object.keys(e.fields).length === 0) continue;
      const entry: CvEntry = { ...e.fields };
      grouped[e.category].push(entry);
    }
    const merged: ProfileCvSlice =
      mode === "replace"
        ? grouped
        : {
            education: [...baseline.education, ...grouped.education],
            exhibitions: [...baseline.exhibitions, ...grouped.exhibitions],
            awards: [...baseline.awards, ...grouped.awards],
            residencies: [...baseline.residencies, ...grouped.residencies],
          };
    const appliedCount =
      grouped.education.length +
      grouped.exhibitions.length +
      grouped.awards.length +
      grouped.residencies.length;
    onApply(merged, { mode, appliedCount });
    // Close the wizard back to its idle, collapsed shell.
    setEntries([]);
    setSkip(new Set());
    setConfidence(null);
    setNote(null);
    setUrl("");
    setFile(null);
    setMode("add");
    setOpen(false);
    setState("idle");
  }, [entries, skip, mode, baseline, onApply]);

  const discard = useCallback(() => {
    setEntries([]);
    setSkip(new Set());
    setConfidence(null);
    setNote(null);
    setState("idle");
  }, []);

  /* --------------------------------- render ------------------------------- */

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-start gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/70 px-4 py-3 text-left transition hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
      >
        <span aria-hidden="true" className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white">
          <SparklesIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-zinc-900">
            {t("cv.import.title")}
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
            {t("cv.import.intro")}
          </span>
        </span>
        <span aria-hidden="true" className="mt-1 text-xs text-zinc-400">
          {t("cv.import.expand")} →
        </span>
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{t("cv.import.title")}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">{t("cv.import.intro")}</p>
        </div>
        {state !== "running" && state !== "saving" && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              discard();
              setUrl("");
              setFile(null);
            }}
            className="text-xs text-zinc-500 hover:text-zinc-900"
          >
            {t("cv.import.collapse")}
          </button>
        )}
      </header>

      {state === "idle" && (
        <IdleStep
          url={url}
          onUrlChange={(v) => {
            setUrl(v);
            if (v.trim()) setFile(null);
          }}
          file={file}
          fileInputRef={fileInputRef}
          onPickFile={onPickFile}
          onClearFile={onClearFile}
          error={error}
          canRun={Boolean(url.trim()) || Boolean(file)}
          onRun={runImport}
        />
      )}

      {state === "running" && (
        <div className="space-y-2">
          {scanFallbackBanner && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800">
              <p>{t("cv.import.scanFallbackBanner")}</p>
              <p className="mt-0.5 text-amber-700">
                {t("cv.import.scanFallbackMaxPages").replace(
                  "{count}",
                  String(scanFallbackBanner.pageCount),
                )}
              </p>
            </div>
          )}
          <RunningStep
            message={
              scanFallbackBanner
                ? t("cv.import.statusVisionExtracting")
                : file?.kind === "image"
                  ? t("cv.import.statusReadingImage")
                  : t(RUNNING_STATUS_KEYS[statusIdx])
            }
          />
        </div>
      )}

      {state === "preview" && (
        <PreviewStep
          entries={entries}
          skip={skip}
          baseline={baseline}
          confidence={confidence}
          note={note}
          mode={mode}
          baselineCount={baselineCount}
          onMode={setMode}
          onUpdateFields={updateEntryFields}
          onUpdateCategory={updateEntryCategory}
          onRemove={removeEntry}
          onToggleSkip={toggleSkip}
          onSkipAllDuplicates={() => {
            setSkip((prev) => {
              const next = new Set(prev);
              for (let i = 0; i < entries.length; i += 1) {
                const e = entries[i];
                const slice = baseline[e.category as keyof ProfileCvSlice] ?? [];
                if (findSimilarIndex(e.category, e.fields, slice) >= 0) next.add(i);
              }
              return next;
            });
          }}
          onIncludeAllDuplicates={() => {
            setSkip((prev) => {
              const next = new Set(prev);
              for (let i = 0; i < entries.length; i += 1) {
                const e = entries[i];
                const slice = baseline[e.category as keyof ProfileCvSlice] ?? [];
                if (findSimilarIndex(e.category, e.fields, slice) >= 0) next.delete(i);
              }
              return next;
            });
          }}
          onConfirm={confirm}
          onDiscard={discard}
        />
      )}

      {state === "saving" && <RunningStep message={t("cv.import.savingDots")} />}
    </section>
  );
}

/* ---------------------------------- steps --------------------------------- */

function IdleStep({
  url,
  onUrlChange,
  file,
  fileInputRef,
  onPickFile,
  onClearFile,
  error,
  canRun,
  onRun,
}: {
  url: string;
  onUrlChange: (v: string) => void;
  file: { name: string } | null;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onPickFile: (f: File) => void;
  onClearFile: () => void;
  error: string | null;
  canRun: boolean;
  onRun: () => void;
}) {
  const { t } = useT();
  const urlId = useId();
  const fileId = useId();

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={urlId} className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
          {t("cv.import.urlLabel")}
        </label>
        <input
          id={urlId}
          type="text"
          inputMode="url"
          spellCheck={false}
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder={t("cv.import.urlPlaceholder")}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300"
        />
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{t("cv.import.urlHint")}</p>
      </div>

      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200" />
        <span>or</span>
        <span className="h-px flex-1 bg-zinc-200" />
      </div>

      <div>
        <label htmlFor={fileId} className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
          {t("cv.import.fileLabel")}
        </label>
        {file ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50/70 px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-zinc-800">{file.name}</span>
            <button
              type="button"
              onClick={onClearFile}
              className="text-xs text-zinc-500 hover:text-zinc-900"
            >
              {t("cv.import.fileClear")}
            </button>
          </div>
        ) : (
          <label
            htmlFor={fileId}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-600 hover:border-zinc-400"
          >
            <span>{t("cv.import.fileChoose")}</span>
            <span className="text-[11px] text-zinc-400">PDF · DOCX · IMG · ≤ 5MB</span>
          </label>
        )}
        <input
          ref={fileInputRef}
          id={fileId}
          type="file"
          accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp,.pdf,.docx,.png,.jpg,.jpeg,.webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
          }}
        />
        <p className="mt-1 text-[11px] text-zinc-500">{t("cv.import.fileHintWithImages")}</p>
      </div>

      {error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t(error as Parameters<ReturnType<typeof useT>["t"]>[0])}
        </p>
      )}

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun}
          className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("cv.import.runCta")}
        </button>
      </div>
    </div>
  );
}

function RunningStep({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-zinc-50/70 px-4 py-6 text-sm text-zinc-700">
      <span
        aria-hidden="true"
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900"
      />
      {message}
    </div>
  );
}

function PreviewStep({
  entries,
  skip,
  baseline,
  confidence,
  note,
  mode,
  baselineCount,
  onMode,
  onUpdateFields,
  onUpdateCategory,
  onRemove,
  onToggleSkip,
  onSkipAllDuplicates,
  onIncludeAllDuplicates,
  onConfirm,
  onDiscard,
}: {
  entries: CvImportEntry[];
  skip: Set<number>;
  baseline: ProfileCvSlice;
  confidence: number | null;
  note: string | null;
  mode: MergeMode;
  baselineCount: number;
  onMode: (m: MergeMode) => void;
  onUpdateFields: (idx: number, fields: Record<string, string>) => void;
  onUpdateCategory: (idx: number, cat: CvImportCategory) => void;
  onRemove: (idx: number) => void;
  onToggleSkip: (idx: number) => void;
  onSkipAllDuplicates: () => void;
  onIncludeAllDuplicates: () => void;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const { t } = useT();
  const duplicateFlags = useMemo(
    () =>
      entries.map((e) => {
        const slice = baseline[e.category as keyof ProfileCvSlice] ?? [];
        return findSimilarIndex(e.category, e.fields, slice) >= 0;
      }),
    [entries, baseline],
  );
  const duplicateCount = duplicateFlags.filter(Boolean).length;
  const allDuplicatesSkipped =
    duplicateCount > 0 && duplicateFlags.every((d, i) => !d || skip.has(i));
  const includedCount = entries.reduce(
    (acc, _, i) => (skip.has(i) ? acc : acc + 1),
    0,
  );

  if (entries.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-zinc-50/70 px-4 py-5 text-sm text-zinc-700">
          {t("cv.import.emptyResult")} {t("cv.import.tipResume")}
          {note && (
            <p className="mt-2 text-xs text-zinc-500">
              {t("cv.import.modelNote").replace("{note}", note)}
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-300 hover:text-zinc-900"
          >
            {t("cv.import.discard")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h4 className="text-sm font-semibold text-zinc-900">{t("cv.import.previewTitle")}</h4>
        <p className="mt-0.5 text-xs text-zinc-500">{t("cv.import.previewIntro")}</p>
        {(confidence !== null || note) && (
          <p className="mt-2 text-[11px] text-zinc-500">
            {confidence !== null && (
              <span>
                {t("cv.import.confidenceLabel")}: {Math.round(confidence * 100)}%
              </span>
            )}
            {confidence !== null && note ? " · " : ""}
            {note && (
              <span>{t("cv.import.modelNote").replace("{note}", note)}</span>
            )}
          </p>
        )}
        {duplicateCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800">
            <span>
              {t("cv.import.duplicateCount").replace("{count}", String(duplicateCount))}
            </span>
            {allDuplicatesSkipped ? (
              <button
                type="button"
                onClick={onIncludeAllDuplicates}
                className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:border-amber-400"
              >
                {t("cv.import.includeAllDuplicates")}
              </button>
            ) : (
              <button
                type="button"
                onClick={onSkipAllDuplicates}
                className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:border-amber-400"
              >
                {t("cv.import.excludeAllDuplicates")}
              </button>
            )}
          </div>
        )}
      </header>

      <ul className="space-y-2">
        {entries.map((e, i) => (
          <li key={i}>
            <PreviewEntry
              entry={e}
              isDuplicate={duplicateFlags[i]}
              isSkipped={skip.has(i)}
              onCategory={(c) => onUpdateCategory(i, c)}
              onFields={(fields) => onUpdateFields(i, fields)}
              onRemove={() => onRemove(i)}
              onToggleSkip={() => onToggleSkip(i)}
            />
          </li>
        ))}
      </ul>

      {/* Mode selector */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <RadioPill
            checked={mode === "add"}
            onChange={() => onMode("add")}
            label={t("cv.import.modeAdd")}
          />
          <RadioPill
            checked={mode === "replace"}
            onChange={() => onMode("replace")}
            label={t("cv.import.modeReplace")}
          />
        </div>
        {mode === "replace" && baselineCount > 0 && (
          <p className="mt-2 text-[11px] text-amber-700">
            {t("cv.import.modeReplaceWarn").replace("{count}", String(baselineCount))}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-300 hover:text-zinc-900"
        >
          {t("cv.import.discard")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={includedCount === 0}
          className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("cv.import.confirmCta")}
        </button>
      </div>
    </div>
  );
}

function PreviewEntry({
  entry,
  isDuplicate,
  isSkipped,
  onCategory,
  onFields,
  onRemove,
  onToggleSkip,
}: {
  entry: CvImportEntry;
  isDuplicate: boolean;
  isSkipped: boolean;
  onCategory: (c: CvImportCategory) => void;
  onFields: (f: Record<string, string>) => void;
  onRemove: () => void;
  onToggleSkip: () => void;
}) {
  const { t } = useT();
  const orderedKeys = useMemo(() => orderKeysFor(entry.category, entry.fields), [entry]);
  return (
    <div
      className={`rounded-2xl border bg-white p-3 transition ${
        isSkipped ? "border-zinc-200 opacity-60" : "border-zinc-200"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            value={entry.category}
            onChange={(e) => onCategory(e.target.value as CvImportCategory)}
            disabled={isSkipped}
            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-700 hover:border-zinc-300 focus:border-zinc-400 focus:outline-none disabled:cursor-not-allowed"
          >
            <option value="education">{t(CATEGORY_LABEL_KEY.education)}</option>
            <option value="exhibitions">{t(CATEGORY_LABEL_KEY.exhibitions)}</option>
            <option value="awards">{t(CATEGORY_LABEL_KEY.awards)}</option>
            <option value="residencies">{t(CATEGORY_LABEL_KEY.residencies)}</option>
          </select>
          {isDuplicate && (
            <span
              title={t("cv.import.duplicateTooltip")}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700"
            >
              {t("cv.import.duplicateBadge")}
            </span>
          )}
          {isSkipped && (
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">
              {t("cv.import.entrySkipped")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <button
            type="button"
            onClick={onToggleSkip}
            className="text-zinc-500 hover:text-zinc-900"
          >
            {isSkipped ? t("cv.import.entryInclude") : t("cv.import.entryExclude")}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="text-zinc-500 hover:text-zinc-900"
          >
            {t("cv.import.removeEntry")}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        {orderedKeys.map((k) => (
          <FieldRow
            key={k}
            fieldKey={k}
            value={entry.fields[k] ?? ""}
            onChange={(v) => {
              const next = { ...entry.fields };
              if (v.trim()) next[k] = v;
              else delete next[k];
              onFields(next);
            }}
            colSpan={colSpanFor(entry.category, k)}
            disabled={isSkipped}
          />
        ))}
      </div>
    </div>
  );
}

function FieldRow({
  fieldKey,
  value,
  onChange,
  colSpan,
  disabled,
}: {
  fieldKey: string;
  value: string;
  onChange: (v: string) => void;
  colSpan: string;
  disabled?: boolean;
}) {
  const { t } = useT();
  const labelKey = LABEL_BY_FIELD[fieldKey];
  return (
    <label className={`block ${colSpan}`}>
      <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {labelKey ? t(labelKey) : fieldKey}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300 disabled:bg-zinc-50 disabled:text-zinc-500"
      />
    </label>
  );
}

function RadioPill({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-700">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 accent-zinc-900"
      />
      <span>{label}</span>
    </label>
  );
}

/* ---------------------------------- utils --------------------------------- */

const FIELD_ORDER: Record<CvImportCategory, string[]> = {
  education: ["school", "program", "year", "type"],
  exhibitions: ["title", "venue", "city", "year"],
  awards: ["name", "organization", "year"],
  residencies: ["name", "location", "year_from", "year_to", "year"],
};

function orderKeysFor(cat: CvImportCategory, fields: Record<string, string>): string[] {
  const known = FIELD_ORDER[cat];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of known) {
    out.push(k);
    seen.add(k);
  }
  // Append any extra keys (e.g. from a P6.3 import flow that introduces
  // a new field) so the user can edit them in place — never silently drop.
  for (const k of Object.keys(fields)) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}

function colSpanFor(cat: CvImportCategory, key: string): string {
  if (cat === "education") {
    if (key === "school") return "sm:col-span-7";
    if (key === "year") return "sm:col-span-5";
    if (key === "program") return "sm:col-span-7";
    return "sm:col-span-5";
  }
  if (cat === "exhibitions") {
    if (key === "title") return "sm:col-span-9";
    if (key === "year") return "sm:col-span-3";
    if (key === "venue") return "sm:col-span-7";
    return "sm:col-span-5";
  }
  if (cat === "awards") {
    if (key === "name") return "sm:col-span-9";
    if (key === "year") return "sm:col-span-3";
    return "sm:col-span-12";
  }
  // residencies
  if (key === "name") return "sm:col-span-12";
  if (key === "location") return "sm:col-span-6";
  return "sm:col-span-3";
}

const LABEL_BY_FIELD: Record<string, Parameters<ReturnType<typeof useT>["t"]>[0]> = {
  school: "cv.editor.field.school",
  program: "cv.editor.field.program",
  year: "cv.editor.field.year",
  type: "cv.editor.field.type",
  title: "cv.editor.field.title",
  venue: "cv.editor.field.venue",
  city: "cv.editor.field.city",
  name: "cv.editor.field.name",
  organization: "cv.editor.field.organization",
  location: "cv.editor.field.location",
  year_from: "cv.editor.field.startYear",
  year_to: "cv.editor.field.endYear",
};

function degradedKeyFor(r: CvImportResult & { extractError?: string }): string {
  const reason = r.reason ?? "error";
  // Prefer `extractError` (returned by the route on extraction failures)
  // over the generic `reason` so we can map URL-vs-PDF errors precisely.
  const extract = (r as { extractError?: string }).extractError;
  if (extract) {
    if (extract.startsWith("url_")) return "cv.import.errorUrl";
    if (extract.startsWith("pdf_")) return "cv.import.errorPdf";
    if (extract.startsWith("docx_")) return "cv.import.errorDocx";
    if (extract.includes("too_large")) return "cv.import.errorTooLarge";
  }
  // Some validation reasons surface as `validation` strings (set by
  // `handleAiRoute` when the body parser rejects the request); map
  // image-specific ones to the image error copy.
  const validation = (r as { validation?: string }).validation;
  if (validation) {
    if (
      validation === "invalid_image" ||
      validation === "invalid_image_mime" ||
      validation === "missing_image_data" ||
      validation === "image_too_large" ||
      validation === "too_many_images"
    ) {
      return validation === "image_too_large" ? "cv.import.errorTooLarge" : "cv.import.errorImage";
    }
  }
  if (reason === "unauthorized") return "cv.import.errorUnauthorized";
  if (reason === "cap" || reason === "rate_limit") return "cv.import.errorCap";
  if (reason === "no_key") return "cv.import.errorNoKey";
  return "cv.import.errorGeneric";
}

function SparklesIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="M5.6 5.6l2.1 2.1" />
      <path d="M16.3 16.3l2.1 2.1" />
      <path d="M5.6 18.4l2.1-2.1" />
      <path d="M16.3 7.7l2.1-2.1" />
    </svg>
  );
}
