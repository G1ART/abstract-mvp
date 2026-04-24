import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/websiteImport/supabaseServer";
import type { WebsiteImportCandidate, WebsiteImportMatchRow } from "@/lib/websiteImport/types";
import { buildMatchRow } from "@/lib/websiteImport/matchEngine";
import { dhashFromImageBuffer } from "@/lib/websiteImport/dhash";
import { publicArtworkObjectUrl } from "@/lib/websiteImport/storagePublicUrl";
import { UPLOAD_WEBSITE_MATCH_MAX_ARTWORKS } from "@/lib/upload/limits";
import { recordUsageEvent } from "@/lib/metering/recordUsageEvent";
import { USAGE_KEYS } from "@/lib/metering/usageKeys";

export const runtime = "nodejs";
export const maxDuration = 60;

type SessionRow = {
  id: string;
  status: string;
  acting_profile_id: string | null;
  candidates: unknown;
};

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
  if (candidates.length === 0) {
    return NextResponse.json({ error: "no_candidates" }, { status: 409 });
  }

  const effectiveArtist = sr.acting_profile_id ?? auth.userId;

  await auth.supabase
    .from("website_import_sessions")
    .update({ status: "matching", updated_at: new Date().toISOString() })
    .eq("id", id);

  const { data: artworks, error: aErr } = await auth.supabase
    .from("artworks")
    .select("id, artist_id, visibility, artwork_images(storage_path, sort_order)")
    .in("id", artworkIds);

  if (aErr || !artworks?.length) {
    await auth.supabase
      .from("website_import_sessions")
      .update({ status: "scan_done", updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ error: "artworks_load_failed" }, { status: 400 });
  }

  const rows: WebsiteImportMatchRow[] = [];

  for (const aw of artworks as {
    id: string;
    artist_id: string;
    visibility: string | null;
    artwork_images: { storage_path: string; sort_order?: number | null }[] | null;
  }[]) {
    if (aw.artist_id !== effectiveArtist || aw.visibility !== "draft") {
      continue;
    }
    const imgs = [...(aw.artwork_images ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    const path = imgs[0]?.storage_path;
    if (!path) {
      rows.push({
        artwork_id: aw.id,
        chosen_candidate_id: null,
        match_status: "no_match",
        confidence: 0,
        top_matches: [],
        proposed: null,
        field_provenance: {},
      });
      continue;
    }
    try {
      const url = publicArtworkObjectUrl(path);
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) throw new Error("fetch_failed");
      const buf = Buffer.from(await res.arrayBuffer());
      const hash = await dhashFromImageBuffer(buf);
      const sharpMod = (await import("sharp")).default;
      const meta = await sharpMod(buf).metadata();
      const row = buildMatchRow(aw.id, hash, meta.width ?? undefined, meta.height ?? undefined, candidates);
      rows.push(row);
    } catch {
      rows.push({
        artwork_id: aw.id,
        chosen_candidate_id: null,
        match_status: "no_match",
        confidence: 0,
        top_matches: [],
        proposed: null,
        field_provenance: {},
      });
    }
  }

  const prevRows = (Array.isArray((session as { match_rows?: unknown }).match_rows)
    ? (session as { match_rows: WebsiteImportMatchRow[] }).match_rows
    : []) as WebsiteImportMatchRow[];
  const idSet = new Set(artworkIds);
  const kept = prevRows.filter((r) => r && typeof r.artwork_id === "string" && !idSet.has(r.artwork_id));
  const merged = [...kept, ...rows];

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
      },
    },
    { client: auth.supabase, dualWriteBeta: false },
  );

  return NextResponse.json({ ok: true, rows, merged_count: merged.length });
}
