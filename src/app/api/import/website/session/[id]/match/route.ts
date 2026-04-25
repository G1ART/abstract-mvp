import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/websiteImport/supabaseServer";
import type {
  WebsiteImportCandidate,
  WebsiteImportMatchErrorCode,
  WebsiteImportMatchRow,
} from "@/lib/websiteImport/types";
import { buildMatchRow } from "@/lib/websiteImport/matchEngine";
import { dhashAndMetadataFromImageBuffer } from "@/lib/websiteImport/dhash";
import { publicArtworkObjectUrl } from "@/lib/websiteImport/storagePublicUrl";
import { UPLOAD_WEBSITE_MATCH_MAX_ARTWORKS } from "@/lib/upload/limits";
import { recordUsageEvent } from "@/lib/metering/recordUsageEvent";
import { USAGE_KEYS } from "@/lib/metering/usageKeys";

export const runtime = "nodejs";
export const maxDuration = 60;

const FETCH_TIMEOUT_MS = 12000;
const MATCH_CONCURRENCY = 4;

type SessionRow = {
  id: string;
  status: string;
  acting_profile_id: string | null;
  candidates: unknown;
  match_rows: unknown;
};

function noMatchRow(artworkId: string, code: WebsiteImportMatchErrorCode | null): WebsiteImportMatchRow {
  return {
    artwork_id: artworkId,
    chosen_candidate_id: null,
    match_status: "no_match",
    confidence: 0,
    top_matches: [],
    proposed: null,
    field_provenance: {},
    error_code: code,
  };
}

async function runWithLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  }
  const workers = Array(Math.min(limit, items.length)).fill(0).map(() => worker());
  await Promise.all(workers);
  return out;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserFromRequest(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let artworkIds: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.artworkIds)) {
      artworkIds = body.artworkIds.filter((x: unknown) => typeof x === "string");
    }
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (artworkIds.length === 0) {
    return NextResponse.json({ error: "artworkIds_required" }, { status: 400 });
  }
  if (artworkIds.length > UPLOAD_WEBSITE_MATCH_MAX_ARTWORKS) {
    return NextResponse.json({ error: "too_many_ids" }, { status: 400 });
  }

  const { data: session, error: sErr } = await auth.supabase
    .from("website_import_sessions")
    .select("id, status, acting_profile_id, candidates, match_rows")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (sErr || !session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const sr = session as SessionRow;
  if (sr.status !== "scan_done" && sr.status !== "matched" && sr.status !== "applied") {
    return NextResponse.json({ error: "scan_not_ready", status: sr.status }, { status: 409 });
  }

  const candidates = (Array.isArray(sr.candidates) ? sr.candidates : []) as WebsiteImportCandidate[];

  const prevRows = (Array.isArray(sr.match_rows) ? sr.match_rows : []) as WebsiteImportMatchRow[];
  const prevById = new Map<string, WebsiteImportMatchRow>();
  for (const r of prevRows) {
    if (r && typeof r.artwork_id === "string") prevById.set(r.artwork_id, r);
  }

  // Manually picked rows are sticky: re-running match must not erase the
  // user's choice. Skip them at fetch/hash time entirely so the request
  // budget goes to the artworks that actually need it.
  const idsToProcess = artworkIds.filter((id) => {
    const prev = prevById.get(id);
    return !(prev && prev.manual_pick === true);
  });

  if (candidates.length === 0) {
    // Even with zero candidates, we still want to write `no_candidates`
    // diagnostic rows so the UI can explain why nothing matched.
    const fallback: WebsiteImportMatchRow[] = idsToProcess.map((aid) =>
      noMatchRow(aid, "no_candidates"),
    );
    const idSet = new Set(idsToProcess);
    const kept = prevRows.filter((r) => r && typeof r.artwork_id === "string" && !idSet.has(r.artwork_id));
    const merged = [...kept, ...fallback];
    await auth.supabase
      .from("website_import_sessions")
      .update({
        status: "matched",
        match_rows: merged,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return NextResponse.json({ ok: true, rows: fallback, merged_count: merged.length, no_candidates: true });
  }

  const effectiveArtist = sr.acting_profile_id ?? auth.userId;

  await auth.supabase
    .from("website_import_sessions")
    .update({ status: "matching", updated_at: new Date().toISOString() })
    .eq("id", id);

  const { data: artworks, error: aErr } = await auth.supabase
    .from("artworks")
    .select("id, artist_id, visibility, artwork_images(storage_path, sort_order)")
    .in("id", idsToProcess.length ? idsToProcess : artworkIds);

  if (aErr || !artworks) {
    await auth.supabase
      .from("website_import_sessions")
      .update({ status: "scan_done", updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ error: "artworks_load_failed" }, { status: 400 });
  }

  type ArtworkRow = {
    id: string;
    artist_id: string;
    visibility: string | null;
    artwork_images: { storage_path: string; sort_order?: number | null }[] | null;
  };

  const valid: ArtworkRow[] = (artworks as ArtworkRow[]).filter(
    (aw) => aw.artist_id === effectiveArtist && aw.visibility === "draft",
  );

  const rows = await runWithLimit(valid, MATCH_CONCURRENCY, async (aw) => {
    const imgs = [...(aw.artwork_images ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    const path = imgs[0]?.storage_path;
    if (!path) return noMatchRow(aw.id, "fetch_failed");
    try {
      const url = publicArtworkObjectUrl(path);
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, { signal: ctrl.signal });
      } finally {
        clearTimeout(to);
      }
      if (!res.ok) return noMatchRow(aw.id, "fetch_failed");
      const buf = Buffer.from(await res.arrayBuffer());
      let hash: string;
      let width: number | undefined;
      let height: number | undefined;
      try {
        const r = await dhashAndMetadataFromImageBuffer(buf);
        hash = r.dhash_hex;
        width = r.width;
        height = r.height;
      } catch {
        return noMatchRow(aw.id, "decode_failed");
      }
      const row = buildMatchRow(aw.id, hash, width, height, candidates);
      // Annotate `no_match` with `no_similar` so the user sees a more
      // actionable label instead of a generic miss.
      if (row.match_status === "no_match" && (row.error_code === undefined || row.error_code === null)) {
        return { ...row, error_code: "no_similar" as const };
      }
      return row;
    } catch {
      return noMatchRow(aw.id, "fetch_failed");
    }
  });

  // Re-attach the preserved manual-pick rows for artworks we skipped above.
  const processedSet = new Set(valid.map((v) => v.id));
  const idSet = new Set(artworkIds);
  const preservedManual: WebsiteImportMatchRow[] = artworkIds
    .filter((aid) => !processedSet.has(aid))
    .map((aid) => prevById.get(aid))
    .filter((r): r is WebsiteImportMatchRow => Boolean(r));

  const kept = prevRows.filter((r) => r && typeof r.artwork_id === "string" && !idSet.has(r.artwork_id));
  const merged = [...kept, ...preservedManual, ...rows];

  await auth.supabase
    .from("website_import_sessions")
    .update({
      status: "matched",
      match_rows: merged,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  const high = rows.filter((r) => r.match_status === "high_confidence").length;
  const review = rows.filter((r) => r.match_status === "review_needed").length;
  const noMatch = rows.filter((r) => r.match_status === "no_match").length;
  const preservedCount = preservedManual.length;
  void recordUsageEvent(
    {
      key: USAGE_KEYS.IMPORT_WEBSITE_MATCHED,
      userId: auth.userId,
      metadata: {
        session_id: id,
        high,
        review,
        no_match: noMatch,
        batch_artworks: artworkIds.length,
        preserved_manual: preservedCount,
      },
    },
    { client: auth.supabase, dualWriteBeta: false },
  );

  return NextResponse.json({
    ok: true,
    rows: [...preservedManual, ...rows],
    merged_count: merged.length,
    preserved_manual: preservedCount,
  });
}
