"use client";

/**
 * CV editor — four-category inline CRUD (Profile Materials P6.1).
 *
 * Loads all four CV columns at once via `getMyProfileCv`, lets the
 * artist add / edit / delete entries per section, and saves the diff
 * via `updateMyProfileCv`. Save button stays disabled until something
 * actually changed (dirty tracking from the loaded baseline).
 *
 * Entry shape stays loose (`CvEntry = Record<string, unknown>`) so the
 * P6.2 import flow can carry forward extra keys we haven't exposed in
 * the form yet — those keys travel through the editor untouched.
 *
 * Layout per section:
 *   <header>
 *     uppercase eyebrow + count + "+ Add entry"
 *   </header>
 *   <ul>
 *     for each entry: <EntryCard kind={..} entry={..} onChange={..} onRemove={..} />
 *   </ul>
 *
 * EntryCard renders a small grid of inputs that match the field
 * profile expected for the kind (education / exhibitions / awards /
 * residencies). Field labels come from i18n.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/useT";
import {
  getMyProfileCv,
  updateMyProfileCv,
  type ProfileCvSlice,
} from "@/lib/supabase/profileCv";
import type { CvEntry } from "@/lib/supabase/profiles";
import { FloorPanel } from "@/components/ds/FloorPanel";

type SectionKind = "education" | "exhibitions" | "awards" | "residencies";

const SECTION_ORDER: SectionKind[] = [
  "education",
  "exhibitions",
  "awards",
  "residencies",
];

/* -------------------------------------------------------------------------- */

export function CvEditorClient() {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<ProfileCvSlice | null>(null);
  const [draft, setDraft] = useState<ProfileCvSlice>({
    education: [],
    exhibitions: [],
    awards: [],
    residencies: [],
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await getMyProfileCv();
      if (!alive) return;
      if (error) {
        // Soft failure — still let the user start fresh, but warn.
        setLoadError(t("common.unknownError"));
      }
      setBaseline(data);
      setDraft({
        education: data.education.slice(),
        exhibitions: data.exhibitions.slice(),
        awards: data.awards.slice(),
        residencies: data.residencies.slice(),
      });
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  const dirty = useMemo(() => {
    if (!baseline) return false;
    return SECTION_ORDER.some((k) => !arraysEqual(baseline[k], draft[k]));
  }, [baseline, draft]);

  const updateEntry = useCallback(
    (kind: SectionKind, idx: number, next: CvEntry) => {
      setDraft((prev) => {
        const list = prev[kind].slice();
        list[idx] = next;
        return { ...prev, [kind]: list };
      });
    },
    [],
  );

  const removeEntry = useCallback((kind: SectionKind, idx: number) => {
    setDraft((prev) => {
      const list = prev[kind].slice();
      list.splice(idx, 1);
      return { ...prev, [kind]: list };
    });
  }, []);

  const addEntry = useCallback((kind: SectionKind) => {
    setDraft((prev) => ({ ...prev, [kind]: [...prev[kind], {}] }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!baseline) return;
    setSaving(true);
    setSaveError(null);
    const payload: Partial<ProfileCvSlice> = {};
    for (const k of SECTION_ORDER) {
      if (!arraysEqual(baseline[k], draft[k])) {
        payload[k] = sanitize(draft[k]);
      }
    }
    const r = await updateMyProfileCv(payload);
    setSaving(false);
    if (!r.ok) {
      setSaveError(t("cv.editor.error"));
      return;
    }
    const sanitized: ProfileCvSlice = {
      education: sanitize(draft.education),
      exhibitions: sanitize(draft.exhibitions),
      awards: sanitize(draft.awards),
      residencies: sanitize(draft.residencies),
    };
    setBaseline(sanitized);
    setDraft(sanitized);
    setSavedAt(Date.now());
  }, [baseline, draft, t]);

  const handleDiscard = useCallback(() => {
    if (!baseline) return;
    setDraft({
      education: baseline.education.slice(),
      exhibitions: baseline.exhibitions.slice(),
      awards: baseline.awards.slice(),
      residencies: baseline.residencies.slice(),
    });
    setSaveError(null);
  }, [baseline]);

  if (loading) {
    return (
      <FloorPanel padding="md" className="text-sm text-zinc-500">
        {t("common.loading")}
      </FloorPanel>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {loadError}
        </p>
      )}

      {/* P6.2 import flow lands here — kept as a quiet hint for now so
          users see the surface is being expanded soon. */}
      <FloorPanel padding="sm" className="text-xs text-zinc-500">
        {t("cv.editor.importHint")}
      </FloorPanel>

      {SECTION_ORDER.map((kind) => (
        <CvSection
          key={kind}
          kind={kind}
          entries={draft[kind]}
          onAdd={() => addEntry(kind)}
          onChange={(idx, next) => updateEntry(kind, idx, next)}
          onRemove={(idx) => removeEntry(kind, idx)}
        />
      ))}

      <SaveBar
        dirty={dirty}
        saving={saving}
        savedAt={savedAt}
        error={saveError}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section + entry rendering                                                  */
/* -------------------------------------------------------------------------- */

type CvSectionProps = {
  kind: SectionKind;
  entries: CvEntry[];
  onAdd: () => void;
  onChange: (idx: number, next: CvEntry) => void;
  onRemove: (idx: number) => void;
};

function CvSection({ kind, entries, onAdd, onChange, onRemove }: CvSectionProps) {
  const { t } = useT();
  const labelKey = `cv.editor.${kind}` as const;
  return (
    <section>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
          {t(labelKey)}
          <span className="ml-2 text-[11px] tracking-normal text-zinc-400">
            {entries.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-300 hover:text-zinc-900"
        >
          + {t("cv.editor.addEntry")}
        </button>
      </header>
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/70 px-5 py-4 text-xs text-zinc-500">
          {t("cv.editor.empty")}
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry, idx) => (
            <li key={idx}>
              <EntryCard
                kind={kind}
                entry={entry}
                onChange={(next) => onChange(idx, next)}
                onRemove={() => onRemove(idx)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type EntryCardProps = {
  kind: SectionKind;
  entry: CvEntry;
  onChange: (next: CvEntry) => void;
  onRemove: () => void;
};

function EntryCard({ kind, entry, onChange, onRemove }: EntryCardProps) {
  const fields = FIELD_PROFILES[kind];
  const setField = (key: string, value: string) => {
    const next = { ...entry };
    if (value.trim().length === 0) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        {fields.map((f) => (
          <FieldInput
            key={f.key}
            colSpanClass={f.colSpan}
            labelKey={f.labelKey}
            value={readField(entry, f.key)}
            onChange={(v) => setField(f.key, v)}
            type={f.type ?? "text"}
            inputMode={f.inputMode}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-end">
        <RemoveButton onClick={onRemove} />
      </div>
    </div>
  );
}

function readField(entry: CvEntry, key: string): string {
  const v = entry[key];
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

type FieldType = "text" | "number";
type FieldDef = {
  key: string;
  labelKey:
    | "cv.editor.field.school"
    | "cv.editor.field.program"
    | "cv.editor.field.year"
    | "cv.editor.field.type"
    | "cv.editor.field.title"
    | "cv.editor.field.venue"
    | "cv.editor.field.city"
    | "cv.editor.field.name"
    | "cv.editor.field.organization"
    | "cv.editor.field.location"
    | "cv.editor.field.startYear"
    | "cv.editor.field.endYear";
  colSpan: string;
  type?: FieldType;
  inputMode?: "numeric" | "text";
};

const FIELD_PROFILES: Record<SectionKind, FieldDef[]> = {
  education: [
    { key: "school", labelKey: "cv.editor.field.school", colSpan: "sm:col-span-7" },
    { key: "year", labelKey: "cv.editor.field.year", colSpan: "sm:col-span-5", inputMode: "numeric" },
    { key: "program", labelKey: "cv.editor.field.program", colSpan: "sm:col-span-7" },
    { key: "type", labelKey: "cv.editor.field.type", colSpan: "sm:col-span-5" },
  ],
  exhibitions: [
    { key: "title", labelKey: "cv.editor.field.title", colSpan: "sm:col-span-9" },
    { key: "year", labelKey: "cv.editor.field.year", colSpan: "sm:col-span-3", inputMode: "numeric" },
    { key: "venue", labelKey: "cv.editor.field.venue", colSpan: "sm:col-span-7" },
    { key: "city", labelKey: "cv.editor.field.city", colSpan: "sm:col-span-5" },
  ],
  awards: [
    { key: "name", labelKey: "cv.editor.field.name", colSpan: "sm:col-span-9" },
    { key: "year", labelKey: "cv.editor.field.year", colSpan: "sm:col-span-3", inputMode: "numeric" },
    { key: "organization", labelKey: "cv.editor.field.organization", colSpan: "sm:col-span-12" },
  ],
  residencies: [
    { key: "name", labelKey: "cv.editor.field.name", colSpan: "sm:col-span-12" },
    { key: "location", labelKey: "cv.editor.field.location", colSpan: "sm:col-span-6" },
    { key: "year_from", labelKey: "cv.editor.field.startYear", colSpan: "sm:col-span-3", inputMode: "numeric" },
    { key: "year_to", labelKey: "cv.editor.field.endYear", colSpan: "sm:col-span-3", inputMode: "numeric" },
  ],
};

function FieldInput({
  colSpanClass,
  labelKey,
  value,
  onChange,
  type,
  inputMode,
}: {
  colSpanClass: string;
  labelKey: FieldDef["labelKey"];
  value: string;
  onChange: (v: string) => void;
  type?: FieldType;
  inputMode?: FieldDef["inputMode"];
}) {
  const { t } = useT();
  return (
    <label className={`block ${colSpanClass}`}>
      <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {t(labelKey)}
      </span>
      <input
        type={type ?? "text"}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300"
      />
    </label>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-zinc-500 hover:text-zinc-900"
    >
      {t("cv.editor.removeEntry")}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Save bar                                                                   */
/* -------------------------------------------------------------------------- */

type SaveBarProps = {
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
};

function SaveBar({ dirty, saving, savedAt, error, onSave, onDiscard }: SaveBarProps) {
  const { t } = useT();
  return (
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className="text-xs text-zinc-600">
        {error ? (
          <span className="text-red-600">{error}</span>
        ) : dirty ? (
          <span>{t("cv.editor.unsaved")}</span>
        ) : savedAt ? (
          <span className="text-emerald-700">{t("cv.editor.saved")}</span>
        ) : (
          <span className="text-zinc-400">&nbsp;</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDiscard}
          disabled={!dirty || saving}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("cv.editor.discard")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && (
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"
            />
          )}
          {saving ? t("cv.editor.saving") : t("cv.editor.save")}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function arraysEqual(a: CvEntry[], b: CvEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!entryEqual(a[i], b[i])) return false;
  }
  return true;
}

function entryEqual(a: CvEntry, b: CvEntry): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * Drop fully-empty entries on save so the persisted jsonb stays tidy.
 * An entry counts as empty when no string/number value is present
 * across any of its keys (a user added a row but didn't type anything).
 */
function sanitize(list: CvEntry[]): CvEntry[] {
  const out: CvEntry[] = [];
  for (const entry of list) {
    let hasValue = false;
    for (const k of Object.keys(entry)) {
      const v = entry[k];
      if (typeof v === "string" && v.trim().length > 0) {
        hasValue = true;
        break;
      }
      if (typeof v === "number" && Number.isFinite(v)) {
        hasValue = true;
        break;
      }
    }
    if (hasValue) out.push(entry);
  }
  return out;
}
