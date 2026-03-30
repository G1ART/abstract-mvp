/**
 * Lightweight CSV parser for client-side import/export.
 * No external dependency — handles quoted fields, newlines in quotes, and BOM.
 */

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field.trim());
        field = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        row.push(field.trim());
        if (row.some((f) => f !== "")) lines.push(row);
        row = [];
        field = "";
        if (ch === "\r") i++;
      } else {
        field += ch;
      }
    }
  }
  row.push(field.trim());
  if (row.some((f) => f !== "")) lines.push(row);

  const headers = lines[0] ?? [];
  const rows = lines.slice(1);
  return { headers, rows };
}

export type CsvValidationError = {
  row: number;
  column: string;
  message: string;
};

export function validateCsvRows(
  headers: string[],
  rows: string[][],
  requiredColumns: string[]
): CsvValidationError[] {
  const errors: CsvValidationError[] = [];
  const headerLower = headers.map((h) => h.toLowerCase().trim());
  for (const req of requiredColumns) {
    if (!headerLower.includes(req.toLowerCase())) {
      errors.push({ row: 0, column: req, message: `Missing required column: ${req}` });
    }
  }
  if (errors.length > 0) return errors;
  for (let i = 0; i < rows.length; i++) {
    for (const req of requiredColumns) {
      const idx = headerLower.indexOf(req.toLowerCase());
      if (idx >= 0 && (!rows[i][idx] || rows[i][idx].trim() === "")) {
        errors.push({ row: i + 1, column: req, message: `Empty required field` });
      }
    }
  }
  return errors;
}

export function generateCsv(headers: string[], rows: string[][]): string {
  const escape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(row.map((v) => escape(v ?? "")).join(","));
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
