"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { parseCsv, validateCsvRows, type CsvValidationError } from "@/lib/csv/parse";
import { createDraftArtwork, updateArtwork } from "@/lib/supabase/artworks";
import { generateCsv, downloadCsv } from "@/lib/csv/parse";
import { supabase } from "@/lib/supabase/client";

const REQUIRED_COLUMNS = ["title"];
const SUPPORTED_COLUMNS = [
  "title", "year", "medium", "size", "size_unit",
  "ownership_status", "pricing_mode", "description",
  "visibility", "price", "currency", "is_price_public",
  "artist_name", "artist_username", "tags",
];

type ImportRow = {
  idx: number;
  fields: Record<string, string>;
  status: "pending" | "success" | "error" | "skipped";
  error?: string;
  duplicate?: boolean;
};

function ImportContent() {
  const { t } = useT();
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<CsvValidationError[]>([]);
  const [step, setStep] = useState<"paste" | "map" | "preview" | "importing" | "done">("paste");
  const [progress, setProgress] = useState(0);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const handleParse = useCallback(() => {
    const { headers: h, rows: r } = parseCsv(csvText);
    if (h.length === 0 || r.length === 0) return;
    setHeaders(h);

    const autoMap: Record<string, string> = {};
    for (const col of SUPPORTED_COLUMNS) {
      const norm = col.replace(/_/g, "").toLowerCase();
      const match = h.findIndex(
        (hh) => hh.toLowerCase().replace(/[^a-z]/g, "") === norm
      );
      if (match >= 0) autoMap[col] = h[match];
    }
    setMapping(autoMap);

    const importRows: ImportRow[] = r.map((cells, i) => {
      const fields: Record<string, string> = {};
      h.forEach((header, ci) => { fields[header] = cells[ci] ?? ""; });
      return { idx: i + 1, fields, status: "pending" };
    });
    setRows(importRows);
    setStep("map");
  }, [csvText]);

  const handleValidate = useCallback(async () => {
    const errs = validateCsvRows(
      Object.keys(mapping).filter((k) => mapping[k]).map((k) => mapping[k]),
      rows.map((r) => Object.keys(mapping).filter((k) => mapping[k]).map((k) => {
        const srcCol = mapping[k];
        const idx = headers.indexOf(srcCol);
        return idx >= 0 ? r.fields[headers[idx]] : "";
      })),
      REQUIRED_COLUMNS.filter((r) => mapping[r])
    );
    setValidationErrors(errs);
    if (errs.filter((e) => e.row === 0).length > 0) return;

    // Duplicate detection: check title + year against existing artworks
    const titleCol = mapping["title"];
    const yearCol = mapping["year"];
    if (titleCol) {
      const titles = rows.map((r) => r.fields[titleCol]?.trim().toLowerCase()).filter(Boolean);
      if (titles.length > 0) {
        const { data: existing } = await supabase
          .from("artworks")
          .select("title, year")
          .in("title", [...new Set(titles.map((t) => rows.find((r) => r.fields[titleCol]?.trim().toLowerCase() === t)?.fields[titleCol]?.trim() ?? ""))]);

        const existingSet = new Set(
          (existing ?? []).map((e: { title: string; year: string | number | null }) =>
            `${(e.title ?? "").toLowerCase()}|${e.year ?? ""}`
          )
        );

        setRows((prev) =>
          prev.map((r) => {
            const title = r.fields[titleCol]?.trim().toLowerCase() ?? "";
            const year = yearCol ? (r.fields[mapping["year"]] ?? "").trim() : "";
            const key = `${title}|${year}`;
            return { ...r, duplicate: existingSet.has(key) };
          })
        );
      }
    }

    setStep("preview");
  }, [mapping, headers, rows]);

  const handleImport = useCallback(async () => {
    setStep("importing");
    let done = 0;
    for (const row of rows) {
      if (skipDuplicates && row.duplicate) {
        row.status = "skipped";
        row.error = "Duplicate — skipped";
        done++;
        setProgress(done);
        continue;
      }

      const titleCol = mapping["title"];
      const title = titleCol ? row.fields[titleCol]?.trim() : "";
      if (!title) { row.status = "error"; row.error = "No title"; done++; setProgress(done); continue; }

      const { data: artworkId, error } = await createDraftArtwork({ title });
      if (error || !artworkId) { row.status = "error"; row.error = "Create failed"; done++; setProgress(done); continue; }

      const updates: Record<string, unknown> = {};
      const mapField = (field: string) => {
        const col = mapping[field];
        return col ? (row.fields[col] ?? "").trim() : "";
      };

      if (mapField("year")) updates.year = mapField("year");
      if (mapField("medium")) updates.medium = mapField("medium");
      if (mapField("size")) updates.size = mapField("size");
      if (mapField("size_unit")) updates.size_unit = mapField("size_unit");
      if (mapField("ownership_status")) updates.ownership_status = mapField("ownership_status");
      if (mapField("pricing_mode")) updates.pricing_mode = mapField("pricing_mode");
      if (mapField("description")) updates.description = mapField("description");
      if (mapField("visibility") && ["public", "draft"].includes(mapField("visibility"))) {
        updates.visibility = mapField("visibility");
      }
      if (mapField("price")) updates.price_usd = Number(mapField("price")) || null;
      if (mapField("currency")) updates.currency = mapField("currency");
      if (mapField("is_price_public")) updates.is_price_public = mapField("is_price_public").toLowerCase() === "true";
      if (mapField("tags")) updates.tags = mapField("tags").split(",").map((t: string) => t.trim()).filter(Boolean);

      if (Object.keys(updates).length > 0) {
        await updateArtwork(artworkId, updates);
      }

      row.status = "success";
      done++;
      setProgress(done);
    }
    setRows([...rows]);
    setStep("done");
  }, [rows, mapping, skipDuplicates]);

  const dupCount = rows.filter((r) => r.duplicate).length;
  const successCount = rows.filter((r) => r.status === "success").length;
  const errCount = rows.filter((r) => r.status === "error").length;
  const skipCount = rows.filter((r) => r.status === "skipped").length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/my/library" className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900">← Library</Link>
      <h1 className="mb-6 text-xl font-semibold text-zinc-900">Import artworks</h1>

      {step === "paste" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">
            Paste CSV data below. Only <strong>title</strong> is required — everything else is optional and can be edited later.
          </p>
          <button
            type="button"
            onClick={() => {
              const tmpl = generateCsv(
                SUPPORTED_COLUMNS,
                [SUPPORTED_COLUMNS.map((c) => REQUIRED_COLUMNS.includes(c) ? "(required)" : "(optional)")]
              );
              downloadCsv("import_template.csv", tmpl);
            }}
            className="text-sm text-zinc-500 underline hover:text-zinc-700"
          >
            Download template CSV
          </button>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={10}
            className="w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm"
            placeholder="title,year,medium&#10;Untitled,2024,Oil on canvas"
          />
          <button type="button" disabled={!csvText.trim()} onClick={handleParse} className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">Next</button>
        </div>
      )}

      {step === "map" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">Match your columns to artwork fields. {rows.length} rows found.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SUPPORTED_COLUMNS.map((col) => (
              <div key={col} className="flex items-center gap-2">
                <label className="w-32 text-sm text-zinc-700">
                  {col.replace(/_/g, " ")}{REQUIRED_COLUMNS.includes(col) ? <span className="text-red-500"> *</span> : ""}
                </label>
                <select value={mapping[col] ?? ""} onChange={(e) => setMapping((prev) => ({ ...prev, [col]: e.target.value }))} className="flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm">
                  <option value="">— skip —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          {validationErrors.filter((e) => e.row === 0).map((e, i) => (
            <p key={i} className="text-sm text-red-600">{e.message}</p>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleValidate()} className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">Validate & Preview</button>
            <button type="button" onClick={() => setStep("paste")} className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Back</button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-zinc-700">{rows.length} rows</span>
            {dupCount > 0 && (
              <span className="text-amber-700">{dupCount} possible duplicates</span>
            )}
            {dupCount > 0 && (
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-300" />
                Skip duplicates
              </label>
            )}
          </div>
          <div className="max-h-72 overflow-auto rounded border border-zinc-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  {SUPPORTED_COLUMNS.filter((c) => mapping[c]).map((c) => (
                    <th key={c} className="px-3 py-2">{c}</th>
                  ))}
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.slice(0, 100).map((r) => (
                  <tr key={r.idx} className={r.duplicate ? "bg-amber-50" : ""}>
                    <td className="px-3 py-1.5 text-zinc-400">{r.idx}</td>
                    {SUPPORTED_COLUMNS.filter((c) => mapping[c]).map((c) => (
                      <td key={c} className="max-w-[150px] truncate px-3 py-1.5 text-zinc-700">{r.fields[mapping[c]] ?? ""}</td>
                    ))}
                    <td className="px-3 py-1.5">{r.duplicate ? <span className="text-xs text-amber-700">dup?</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 100 && <p className="text-xs text-zinc-400">Showing first 100 of {rows.length}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleImport()} className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
              Import {skipDuplicates ? rows.length - dupCount : rows.length} rows
            </button>
            <button type="button" onClick={() => setStep("map")} className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Back</button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Importing... {progress} / {rows.length}</p>
          <div className="h-2 w-full rounded-full bg-zinc-200">
            <div className="h-2 rounded-full bg-zinc-800 transition-all" style={{ width: `${(progress / Math.max(rows.length, 1)) * 100}%` }} />
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">Done!</p>
            <p className="mt-1 text-sm text-green-700">
              {successCount} artwork{successCount !== 1 ? "s" : ""} added as drafts.
              {skipCount > 0 ? ` ${skipCount} skipped (duplicates).` : ""}
              {errCount > 0 ? ` ${errCount} had issues — see below.` : ""}
            </p>
          </div>
          {errCount > 0 && (
            <ul className="max-h-32 space-y-1 overflow-y-auto">
              {rows.filter((r) => r.status === "error").map((r) => (
                <li key={r.idx} className="text-sm text-red-600">Row {r.idx}: {r.error}</li>
              ))}
            </ul>
          )}
          <Link href="/my/library" className="inline-block rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">Go to Library</Link>
        </div>
      )}
    </main>
  );
}

export default function ImportPage() {
  return (
    <AuthGate>
      <ImportContent />
    </AuthGate>
  );
}
