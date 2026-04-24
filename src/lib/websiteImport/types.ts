/** Confidence bucket for a proposed image ↔ artwork match. */
export type WebsiteImportMatchStatus = "high_confidence" | "review_needed" | "no_match" | "pending";

export type WebsiteImportParsedFields = {
  title?: string | null;
  year?: number | null;
  medium?: string | null;
  size?: string | null;
  size_unit?: "cm" | "in" | null;
  story?: string | null;
};

export type WebsiteImportCandidate = {
  id: string;
  page_url: string;
  image_url: string;
  dhash_hex: string;
  width?: number;
  height?: number;
  alt_text?: string | null;
  caption_blob?: string | null;
  parsed?: WebsiteImportParsedFields | null;
};

export type WebsiteImportMatchScore = {
  candidate_id: string;
  hamming: number;
  dimension_bonus: number;
};

export type WebsiteImportMatchRow = {
  artwork_id: string;
  chosen_candidate_id: string | null;
  match_status: WebsiteImportMatchStatus;
  confidence: number;
  top_matches: WebsiteImportMatchScore[];
  proposed: WebsiteImportParsedFields | null;
  field_provenance: Record<string, "website">;
  source_page_url?: string | null;
  source_image_url?: string | null;
  raw_caption?: string | null;
};

export type WebsiteImportScanMeta = {
  pages_fetched: number;
  pages_queued_cap: number;
  origin_hostname: string;
  /** Candidates whose caption/metadata parsed to at least one field. */
  candidates_parsed_count?: number;
  /** Non-fatal crawl caveats for UI (e.g. near_candidate_cap). */
  warnings?: string[];
};
