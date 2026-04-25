# Website-assisted bulk import — handoff

## Intent

Optional flow on **Bulk upload** (`/upload/bulk`): user enters a portfolio URL → server crawls **same-origin HTML pages only** → extracts image-heavy blocks and captions → **dHash-based** matching against uploaded draft images (no filename dependency) → user **reviews** in a table → **applies** chosen metadata to drafts. Nothing auto-publishes; fields are only filled from parsed website text or user overrides at apply time.

## New routes (API)

| Method | Path | Role |
|--------|------|------|
| `POST` | `/api/import/website/session` | Create session (`sourceUrl`, optional `actingProfileId`). |
| `GET` | `/api/import/website/session/[id]` | Load session JSON (candidates, match_rows, status). |
| `POST` | `/api/import/website/session/[id]/scan` | Run crawl + candidate hashing; sets `scan_done` or `failed`. `maxDuration` 60s. |
| `POST` | `/api/import/website/session/[id]/match` | Body `{ artworkIds }`. Fetches each draft’s first storage image, dHash, ranks candidates; writes `match_rows`, status `matched`. |
| `POST` | `/api/import/website/session/[id]/pick` | Body `{ artworkId, candidateId }` where `candidateId` is UUID string or `null` to clear. Updates one row. |
| `POST` | `/api/import/website/session/[id]/apply` | Body `{ items: [{ artwork_id, apply: true }] }`. Patches drafts + `website_import_provenance`; status `applied`. |

All routes expect `Authorization: Bearer <supabase access token>`.

## Database

- Migration: `supabase/migrations/20260427000000_website_import_sessions.sql`
  - Table `website_import_sessions` (`candidates`, `match_rows`, `scan_meta` JSONB, RLS by `user_id`).
  - Column `artworks.website_import_provenance` (JSONB, nullable).

## Matching strategy (summary)

1. **Stage A (narrowing):** Perceptual **dHash** (64-bit, 16 hex) on 9×8 grayscale resize via `sharp`; optional **dimension / aspect** bonus in `scoreMatch`.
2. **Stage B (ordering):** Hamming distance on dHash; lower is better; `rankCandidatesForUpload` returns top 8, UI shows top 5.
3. **Confidence buckets** (`bucketMatch` in `src/lib/websiteImport/dhash.ts`):
   - **high_confidence:** best Hamming ≤ 10 and (gap to second ≥ 5 OR second > 16).
   - **review_needed:** weaker or ambiguous (e.g. gap &lt; 4 while best ≤ 18, or best ≤ 22 fallback band).
   - **no_match:** otherwise.
4. **Proposed fields** on a row only when status is `high_confidence` or `review_needed` **and** deterministic `parseMetadataLine` returned data from caption/alt (no LLM in v1).

## Crawl / safety

- `src/lib/websiteImport/urlSafety.ts` — http(s) only, strip common tracking params, block obvious private hostnames.
- **HTML pages:** same hostname as the normalized start URL only.
- **Images for hashing:** same host **or** small CDN suffix allowlist (`squarespace-cdn.com`, `wixstatic.com`, `cloudinary.com`, `imgix.net`, `wp.com`, `files.wordpress.com`, `supabase.co`, `cloudfront.net`, `akamaized.net`).
- Limits: ~28 pages, ~80 queued URLs, ~1.4MB HTML cap, concurrency 3, ~180 candidates, timeouts per fetch.

## Extending (adapters)

Keep heuristics in `crawlSite.ts` / `metadataParse.ts`. For site-specific parsers, add a thin adapter that post-processes `cheerio` output or `WebsiteImportCandidate[]` before hashing—do not fork the session API.

## Metering

- `import.website_scanned` and `import.website_applied` added to `UsageEventKey` / `USAGE_KEYS` (dual-write beta off for these).

## Delegation / acting-as

- Session stores `acting_profile_id`; match/apply require `artworks.artist_id === (acting_profile_id ?? user_id)` and `visibility = draft`.
- `listMyDraftArtworks` now accepts `forProfileId` so bulk drafts list matches `createDraftArtwork` when acting as another profile.

## Tests

- `npm run test:website-import` — URL normalization, metadata parse, Hamming, `bucketMatch` (no crawl / no sharp).

## Known tradeoffs (v1)

- No LLM normalization pipeline yet (patch allowed “second” phase); captions rely on `parseMetadataLine` heuristics.
- No DNS-level SSRF guard on redirects beyond fetch same-origin pages; image hosts use hostname allowlist.
- `publishArtworks` / bulk publish paths still keyed by `session.user.id` in places; acting-as publish may need a follow-up outside this patch.
- Scan is synchronous in one server request (60s cap); very large sites may hit limits by design.

## QA checklist (manual)

1. Bulk upload with website panel **collapsed** behaves as before.
2. Scan a small portfolio → candidate count &gt; 0; status `scan_done`.
3. Upload drafts → **Match** uses staged IDs; review table shows badges.
4. Ambiguous rows show **Needs review**; changing dropdown calls **pick** and refreshes row.
5. **Apply** updates drafts and sets `website_import_provenance`; visibility stays **draft**.
6. Reload page: session can be re-fetched by ID if UI kept it (panel clears with “Clear website import”).
