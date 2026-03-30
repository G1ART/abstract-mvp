"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { parseCsv, validateCsvRows, type CsvValidationError } from "@/lib/csv/parse";
import { createDraftArtwork, updateArtwork } from "@/lib/supabase/artworks";

const REQUIRED_COLUMNS = ["title"];
const SUPPORTED_COLUMNS = ["title", "year", "medium", "size", "size_unit", "ownership_status", "pricing_mode"];

type ImportRow = {
  idx: number;
  fields: Record<string, string>;
  status: "pending" | "success" | "error";
  error?: string;
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

  const handleParse = useCallback(() => {
    const { headers: h, rows: r } = parseCsv(csvText);
    if (h.length === 0 || r.length === 0) return;
    setHeaders(h);

    const autoMap: Record<string, string> = {};
    for (const col of SUPPORTED_COLUMNS) {
      const match = h.findIndex(
        (hh) => hh.toLowerCase().replace(/[^a-z]/g, "") === col.replace(/_/g, "")
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

  const handleValidate = useCallback(() => {
    const mappedHeaders = Object.values(mapping);
    const rawHeaders = headers;
    const rawRows = rows.map((r) => rawHeaders.map((h) => r.fields[h] ?? ""));
    const errs = validateCsvRows(
      Object.keys(mapping).map((k) => mapping[k]),
      rawRows.map((rr) => Object.keys(mapping).map((k) => {
        const srcCol = mapping[k];
        const idx = rawHeaders.indexOf(srcCol);
        return idx >= 0 ? rr[idx] : "";
      })),
      REQUIRED_COLUMNS
    );
    setValidationErrors(errs);
    if (errs.filter((e) => e.row === 0).length === 0) setStep("preview");
  }, [mapping, headers, rows]);

  const handleImport = useCallback(async () => {
    setStep("importing");
    let done = 0;
    for (const row of rows) {
      const titleCol = mapping["title"];
      const title = titleCol ? row.fields[titleCol]?.trim() : "";
      if (!title) { row.status = "error"; row.error = "No title"; done++; setProgress(done); continue; }

      const { data: artworkId, error } = await createDraftArtwork({ title });
      if (error || !artworkId) { row.status = "error"; row.error = "Create failed"; done++; setProgress(done); continue; }

      const updates: Record<string, unknown> = {};
      if (mapping["year"] && row.fields[mapping["year"]]) updates.year = row.fields[mapping["year"]].trim();
      if (mapping["medium"] && row.fields[mapping["medium"]]) updates.medium = row.fields[mapping["medium"]].trim();
      if (mapping["size"] && row.fields[mapping["size"]]) updates.size = row.fields[mapping["size"]].trim();
      if (mapping["size_unit"] && row.fields[mapping["size_unit"]]) updates.size_unit = row.fields[mapping["size_unit"]].trim();
      if (mapping["ownership_status"] && row.fields[mapping["ownership_status"]]) updates.ownership_status = row.fields[mapping["ownership_status"]].trim();
      if (mapping["pricing_mode"] && row.fields[mapping["pricing_mode"]]) updates.pricing_mode = row.fields[mapping["pricing_mode"]].trim();

      if (Object.keys(updates).length > 0) {
        await updateArtwork(artworkId, updates);
      }

      row.status = "success";
      done++;
      setProgress(done);
    }
    setRows([...rows]);
    setStep("done");
  }, [rows, mapping]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/my/library" className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900">
        ← Library
      </Link>
      <h1 className="mb-6 text-xl font-semibold text-zinc-900">Import artworks from CSV</h1>

      {step === "paste" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">Paste CSV text below. Required column: <code>title</code>. Optional: year, medium, size, size_unit, ownership_status, pricing_mode.</p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={10}
            className="w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm"
            placeholder="title,year,medium&#10;Untitled,2024,Oil on canvas"
          />
          <button
            type="button"
            disabled={!csvText.trim()}
            onClick={handleParse}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            Parse
          </button>
        </div>
      )}

      {step === "map" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">Map CSV columns to artwork fields:</p>
          <div className="space-y-2">
            {SUPPORTED_COLUMNS.map((col) => (
              <div key={col} className="flex items-center gap-3">
                <label className="w-40 text-sm font-medium text-zinc-700">{col}{REQUIRED_COLUMNS.includes(col) ? " *" : ""}</label>
                <select
                  value={mapping[col] ?? ""}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [col]: e.target.value }))}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
                >
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
            <button type="button" onClick={handleValidate} className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">Validate & Preview</button>
            <button type="button" onClick={() => setStep("paste")} className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Back</button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">{rows.length} rows ready to import.</p>
          <div className="max-h-64 overflow-y-auto rounded border border-zinc-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  {SUPPORTED_COLUMNS.filter((c) => mapping[c]).map((c) => (
                    <th key={c} className="px-3 py-2">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.slice(0, 50).map((r) => (
                  <tr key={r.idx}>
                    <td className="px-3 py-1.5 text-zinc-400">{r.idx}</td>
                    {SUPPORTED_COLUMNS.filter((c) => mapping[c]).map((c) => (
                      <td key={c} className="px-3 py-1.5 text-zinc-700">{r.fields[mapping[c]] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 50 && <p className="text-xs text-zinc-400">Showing first 50 of {rows.length}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleImport()} className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">Import {rows.length} rows</button>
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
          <p className="text-sm text-green-700">Import complete. {rows.filter((r) => r.status === "success").length} created, {rows.filter((r) => r.status === "error").length} errors.</p>
          {rows.filter((r) => r.status === "error").length > 0 && (
            <ul className="space-y-1">
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
