import type { WebsiteImportParsedFields } from "./types";

const YEAR_RE = /\b(19|20)\d{2}\b/;
const DIMENSION_RE =
  /(\d+(?:\.\d+)?)\s*(?:×|x|X|\*)\s*(\d+(?:\.\d+)?)\s*(cm|mm|in|"|'|ft|m)\b/i;
const DIMENSION_IN_RE = /(\d+(?:\.\d+)?)\s*["']\s*(?:×|x|X)\s*(\d+(?:\.\d+)?)\s*["']/i;

/**
 * Medium keyword dictionary. Entries are matched case-insensitively against
 * each candidate fragment as either a whole-word (English) or substring
 * (CJK) test.
 *
 * Korean coverage note: the audit found medium detection was English-only.
 * Adding the most common Korean fine-art terms so portfolios on
 * Korean-language sites get a parsed medium field instead of falling back
 * to "no medium detected".
 */
const MEDIUM_KEYWORDS_EN = [
  "oil",
  "acrylic",
  "watercolor",
  "watercolour",
  "gouache",
  "canvas",
  "panel",
  "paper",
  "ink",
  "photograph",
  "photo",
  "print",
  "etching",
  "lithograph",
  "monoprint",
  "sculpture",
  "mixed media",
  "mixed-media",
  "digital",
  "bronze",
  "wood",
  "steel",
  "ceramic",
  "porcelain",
  "graphite",
  "pastel",
  "charcoal",
  "marker",
  "pencil",
  "crayon",
  "tempera",
  "fresco",
  "encaustic",
  "embroidery",
  "textile",
  "yarn",
  "thread",
];

const MEDIUM_KEYWORDS_KO = [
  "캔버스",
  "유화",
  "유채",
  "아크릴",
  "수채",
  "수채화",
  "과슈",
  "잉크",
  "한지",
  "장지",
  "화선지",
  "종이",
  "패널",
  "목판",
  "동판",
  "석판",
  "판화",
  "사진",
  "디지털",
  "혼합매체",
  "혼합 매체",
  "혼합재료",
  "조각",
  "도자",
  "도예",
  "청동",
  "스테인리스",
  "철",
  "나무",
  "흑연",
  "파스텔",
  "목탄",
  "연필",
  "크레용",
  "드로잉",
  "자수",
  "섬유",
  "실",
];

const ENG_MEDIUM_RE = new RegExp(
  `\\b(${MEDIUM_KEYWORDS_EN.map((k) => k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})\\b`,
  "i",
);

function looksLikeMedium(text: string): boolean {
  if (ENG_MEDIUM_RE.test(text)) return true;
  for (const k of MEDIUM_KEYWORDS_KO) {
    if (text.includes(k)) return true;
  }
  return false;
}

/**
 * Convert a numeric dimension expressed in `unit` to centimeters/inches,
 * preserving sane decimal precision. Used by the parser to normalize
 * `mm`/`m`/`ft` so downstream artwork records consistently store cm or in.
 */
function normalizeToBase(value: number, unit: string): { value: number; unit: "cm" | "in" } | null {
  const u = unit.toLowerCase();
  if (u === "cm") return { value, unit: "cm" };
  if (u === "mm") return { value: value / 10, unit: "cm" };
  if (u === "m") return { value: value * 100, unit: "cm" };
  if (u === "in" || u === '"') return { value, unit: "in" };
  if (u === "ft" || u === "'") return { value: value * 12, unit: "in" };
  return null;
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

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
      const a = parseFloat(dim[1]!);
      const b = parseFloat(dim[2]!);
      const u = dim[3]!.toLowerCase();
      const normA = normalizeToBase(a, u);
      const normB = normalizeToBase(b, u);
      if (normA && normB && normA.unit === normB.unit) {
        out.size = `${fmtNum(normA.value)} × ${fmtNum(normB.value)} ${normA.unit}`;
        out.size_unit = normA.unit;
      } else {
        out.size = `${dim[1]} × ${dim[2]} ${dim[3]}`;
        if (u === "cm") out.size_unit = "cm";
        else if (u === "in" || u === '"') out.size_unit = "in";
      }
    }
  }

  // Split common separators for title / medium remainder
  const parts = raw
    .split(/\s*[|·,，、;]\s*|\s*[|,—–-]{1,3}\s*|\s{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Old behavior excluded any fragment that contained a year. That ate
  // valid titles like "Wave 2020" or "Diary 2018-2024". Now we only drop
  // fragments that are *just* a year token (or an obvious year + unit
  // suffix), so titles containing a year survive.
  const withoutYearOnly = parts.filter((p) => {
    const t = p.trim();
    if (/^\(?\d{4}\)?\s*년?$/.test(t)) return false;
    return true;
  });
  // Title is the first non-dimension fragment.
  const titleCandidate = withoutYearOnly.find(
    (p) => !/^\d+(?:\.\d+)?\s*[×x*]\s*\d/i.test(p),
  );
  if (titleCandidate && titleCandidate.length <= 200) {
    out.title = titleCandidate;
  }

  // Medium: first remaining fragment that hits a known keyword (en + ko).
  const mediumLike = withoutYearOnly.find(
    (p) => p !== titleCandidate && looksLikeMedium(p),
  );
  if (mediumLike) out.medium = mediumLike;

  const desc = withoutYearOnly.find((p) => p.length > 80 && p !== titleCandidate);
  if (desc) out.story = desc.slice(0, 4000);

  if (!out.title && !out.year && !out.medium && !out.size && !out.story) return null;
  return out;
}

/**
 * Merge multiple caption-source blocks (alt text, figcaption, nearby
 * heading/paragraph) into one normalized line. We join with a "·"
 * separator instead of "—" because the metadata splitter treats em-dash as
 * a major break, which would re-split the merged blob and lose context.
 */
export function mergeCaptionBlocks(...blocks: (string | null | undefined)[]): string | null {
  const merged = blocks
    .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .join(" · ");
  return merged.length > 0 ? merged : null;
}
