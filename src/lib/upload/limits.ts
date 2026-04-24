/**
 * Upload limits documented in UI and used for client-side checks before Storage upload.
 *
 * - **File size:** Matches local `supabase/config.toml` `[storage] file_size_limit = "50MiB"`.
 *   On hosted Supabase, set the same (or another) limit in Dashboard → Project Settings → Storage;
 *   if it differs, adjust `UPLOAD_MAX_IMAGE_BYTES` or add `NEXT_PUBLIC_UPLOAD_MAX_IMAGE_MB` later.
 */

export const UPLOAD_MAX_IMAGE_BYTES = 50 * 1024 * 1024;

/** Whole MB for user-facing copy (50 MiB ≈ 52.4 MB; we label "50 MB" for simplicity). */
export const UPLOAD_MAX_IMAGE_MB_LABEL = 50;

/** `listMyDraftArtworks` fetch limit on bulk upload page — older drafts may not appear until others are published/deleted. */
export const BULK_MY_DRAFTS_QUERY_LIMIT = 100;

/** Max images queued at once on the bulk screen — upload this batch, then add the next. */
export const BULK_MAX_FILES_PER_BATCH = 100;

/** Website-import match: max artwork IDs per `/match` request. */
export const UPLOAD_WEBSITE_MATCH_MAX_ARTWORKS = 80;

/** Bulk page: newest staged artwork ids kept for "match to website" hinting. */
export const BULK_WEBSITE_STAGED_IDS_MAX = 120;
