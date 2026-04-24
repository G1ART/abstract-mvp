import type { WebsiteImportParsedFields } from "./types";

const YEAR_RE = /\b(19|20)\d{2}\b/;
const DIMENSION_RE =
  /\b(\d+(?:\.\d+)?)\s*(?:×|x|X|\*)\s*(\d+(?:\.\d+)?)\s*(cm|mm|in|"|'|ft|m)\b/i;
const DIMENSION_IN_RE = /\b(\d+(?:\.\d+)?)\s*["']\s*(?:×|x|X)\s*(\d+(?:\.\d+)?)\s*["']/i;

/**
 * Deterministic parse of a single caption / metadata line.
 * Never invents values: only extracts when patterns match clearly.
 */
export function parseMetadataLine(text: string | null | undefined): WebsiteImportParsedFields | null {
  if (!text || typeof text !== "string") return null;
  const raw = text
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (raw.length < 2) return null;

  const out: WebsiteImportParsedFields = {};

  const yearMatch = raw.match(YEAR_RE);
  if (yearMatch) {
    const y = parseInt(yearMatch[0], 10);
    if (y >= 1000 && y <= 9999) out.year = y;
  }

  const dimIn = raw.match(DIMENSION_IN_RE);
  if (dimIn) {
    out.size = `${dimIn[1]}" × ${dimIn[2]}"`;
    out.size_unit = "in";
  } else {
    const dim = raw.match(DIMENSION_RE);
    if (dim) {
      const u = dim[3].toLowerCase();
      out.size = `${dim[1]} × ${dim[2]} ${dim[3]}`;
      if (u === "cm") out.size_unit = "cm";
      else if (u === "in" || u === '"') out.size_unit = "in";
    }
  }

  // Split common separators for title / medium remainder
  const parts = raw
    .split(/\s*[|·,，、;]\s*|\s*[|,—–-]{1,3}\s*|\s{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const withoutYear = parts.filter((p) => !YEAR_RE.test(p) || p.length > 12);
  const titleCandidate = withoutYear[0] ?? parts[0];
  if (titleCandidate && titleCandidate.length <= 200 && !/^\d+\s*[×x]\s*\d+/i.test(titleCandidate)) {
    out.title = titleCandidate;
  }

  // Medium: longest remaining fragment that looks like a medium line
  const mediumLike = withoutYear.find(
    (p) =>
      p !== titleCandidate &&
      /(oil|acrylic|watercolor|canvas|panel|paper|ink|photograph|print|sculpture|mixed|digital|bronze|wood|steel|ceramic|graphite|pastel)/i.test(
        p,
      ),
  );
  if (mediumLike) out.medium = mediumLike;

  const desc = withoutYear.find((p) => p.length > 80 && p !== titleCandidate);
  if (desc) out.story = desc.slice(0, 4000);

  if (!out.title && !out.year && !out.medium && !out.size && !out.story) return null;
  return out;
}

export function mergeCaptionBlocks(...blocks: (string | null | undefined)[]): string | null {
  const merged = blocks
    .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .join(" — ");
  return merged.length > 0 ? merged : null;
}
