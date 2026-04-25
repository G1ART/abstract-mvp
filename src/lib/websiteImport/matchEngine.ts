import { bucketMatch, rankCandidatesForUpload } from "./dhash";
import type {
  WebsiteImportCandidate,
  WebsiteImportMatchRow,
  WebsiteImportMatchScore,
  WebsiteImportParsedFields,
} from "./types";

function nonEmptyParsed(p: WebsiteImportParsedFields | null | undefined): WebsiteImportParsedFields | null {
  if (!p) return null;
  const o: WebsiteImportParsedFields = {};
  if (p.title != null && String(p.title).trim()) o.title = String(p.title).trim();
  if (p.year != null && Number.isFinite(p.year)) o.year = p.year;
  if (p.medium != null && String(p.medium).trim()) o.medium = String(p.medium).trim();
  if (p.size != null && String(p.size).trim()) o.size = String(p.size).trim();
  if (p.size_unit === "cm" || p.size_unit === "in") o.size_unit = p.size_unit;
  if (p.story != null && String(p.story).trim()) o.story = String(p.story).trim().slice(0, 8000);
  return Object.keys(o).length > 0 ? o : null;
}

function fieldProvFromParsed(p: WebsiteImportParsedFields): Record<string, "website"> {
  const fp: Record<string, "website"> = {};
  for (const k of Object.keys(p) as (keyof WebsiteImportParsedFields)[]) {
    const v = p[k];
    if (v != null && v !== "") fp[k] = "website";
  }
  return fp;
}

export function buildMatchRow(
  artworkId: string,
  uploadHash: string,
  uploadW: number | undefined,
  uploadH: number | undefined,
  candidates: WebsiteImportCandidate[],
): WebsiteImportMatchRow {
  const rankedFull = rankCandidatesForUpload(uploadHash, uploadW, uploadH, candidates, 8);
  const ranked: WebsiteImportMatchScore[] = rankedFull.map((r) => ({
    candidate_id: r.candidate_id,
    hamming: r.hamming,
    dimension_bonus: r.dimension_bonus,
  }));
  const { status, confidence } = bucketMatch(rankedFull);
  const best = candidates.find((c) => c.id === ranked[0]?.candidate_id) ?? null;

  const chosen_candidate_id =
    status === "no_match" || !ranked[0] ? null : ranked[0].candidate_id;

  const proposed =
    chosen_candidate_id &&
    best?.parsed &&
    (status === "high_confidence" || status === "review_needed")
      ? nonEmptyParsed(best.parsed)
      : null;

  const field_provenance = proposed ? fieldProvFromParsed(proposed) : {};

  return {
    artwork_id: artworkId,
    chosen_candidate_id,
    match_status: status,
    confidence,
    top_matches: ranked,
    proposed,
    field_provenance,
    source_page_url: best?.page_url ?? null,
    source_image_url: best?.image_url ?? null,
    raw_caption: best?.caption_blob ?? null,
  };
}

export function rebuildRowWithCandidate(
  base: WebsiteImportMatchRow,
  candidate?: WebsiteImportCandidate,
): WebsiteImportMatchRow {
  if (!candidate) {
    return {
      ...base,
      chosen_candidate_id: null,
      match_status: "no_match",
      confidence: 0,
      proposed: null,
      field_provenance: {},
      source_page_url: null,
      source_image_url: null,
      raw_caption: null,
      manual_pick: true,
      error_code: null,
    };
  }
  const parsed = nonEmptyParsed(candidate.parsed ?? null);
  const proposed = parsed;
  // Preserve `high_confidence` when the user picks the same candidate the
  // matcher had already chosen — manually picking shouldn't downgrade the
  // status, only confirm it.
  const sameAsAuto = base.chosen_candidate_id === candidate.id;
  const status = sameAsAuto && base.match_status === "high_confidence"
    ? "high_confidence"
    : "review_needed";
  return {
    ...base,
    chosen_candidate_id: candidate.id,
    match_status: status,
    confidence: Math.max(base.confidence, 0.4),
    proposed,
    field_provenance: proposed ? fieldProvFromParsed(proposed) : {},
    source_page_url: candidate.page_url,
    source_image_url: candidate.image_url,
    raw_caption: candidate.caption_blob ?? null,
    manual_pick: true,
    error_code: null,
  };
}
