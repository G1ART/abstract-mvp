import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/websiteImport/supabaseServer";
import type { WebsiteImportCandidate, WebsiteImportMatchRow, WebsiteImportParsedFields } from "@/lib/websiteImport/types";
import { recordUsageEvent } from "@/lib/metering/recordUsageEvent";
import { USAGE_KEYS } from "@/lib/metering/usageKeys";

export const runtime = "nodejs";

type ApplyItem = {
  artwork_id: string;
  apply: boolean;
  chosen_candidate_id?: string | null;
  overrides?: Partial<WebsiteImportParsedFields>;
};

function mergeProposed(
  base: WebsiteImportParsedFields | null | undefined,
  overrides: Partial<WebsiteImportParsedFields> | undefined,
): WebsiteImportParsedFields {
  const o: WebsiteImportParsedFields = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(overrides ?? {})) {
    if (v === undefined) continue;
    if (typeof v === "string" && !v.trim()) continue;
    (o as Record<string, unknown>)[k] = v;
  }
  return o;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserFromRequest(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let items: ApplyItem[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.items)) items = body.items;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { data: session, error: sErr } = await auth.supabase
    .from("website_import_sessions")
    .select("match_rows, candidates, acting_profile_id")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (sErr || !session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const candidates = (Array.isArray(session.candidates) ? session.candidates : []) as WebsiteImportCandidate[];
  const matchRows = (Array.isArray(session.match_rows) ? session.match_rows : []) as WebsiteImportMatchRow[];
  const effectiveArtist = (session.acting_profile_id as string | null) ?? auth.userId;

  let applied = 0;
  const errors: string[] = [];

  for (const item of items) {
    if (!item?.artwork_id || !item.apply) continue;

    const row = matchRows.find((r) => r.artwork_id === item.artwork_id);
    const chosenId =
      item.chosen_candidate_id !== undefined && item.chosen_candidate_id !== null
        ? item.chosen_candidate_id
        : row?.chosen_candidate_id;

    const cand = chosenId ? candidates.find((c) => c.id === chosenId) : null;
    const baseParsed =
      cand?.parsed ??
      (row?.proposed
        ? row.proposed
        : null);

    const merged = mergeProposed(baseParsed, item.overrides);
    const provenance = {
      source: "website_import",
      session_id: id,
      source_page_url: cand?.page_url ?? row?.source_page_url ?? null,
      source_image_url: cand?.image_url ?? row?.source_image_url ?? null,
      raw_caption: cand?.caption_blob ?? row?.raw_caption ?? null,
      match_status: row?.match_status ?? null,
      confidence: row?.confidence ?? null,
      chosen_candidate_id: chosenId ?? null,
      applied_at: new Date().toISOString(),
    };

    const patch: Record<string, unknown> = {
      website_import_provenance: provenance,
    };
    if (merged.title != null && String(merged.title).trim()) patch.title = String(merged.title).trim().slice(0, 500);
    if (merged.year != null && Number.isFinite(merged.year)) patch.year = merged.year;
    if (merged.medium != null && String(merged.medium).trim())
      patch.medium = String(merged.medium).trim().slice(0, 2000);
    if (merged.size != null && String(merged.size).trim()) patch.size = String(merged.size).trim().slice(0, 500);
    if (merged.size_unit === "cm" || merged.size_unit === "in") patch.size_unit = merged.size_unit;
    if (merged.story != null && String(merged.story).trim())
      patch.story = String(merged.story).trim().slice(0, 12000);

    const { data: aw, error: awErr } = await auth.supabase
      .from("artworks")
      .select("id, artist_id, visibility")
      .eq("id", item.artwork_id)
      .maybeSingle();

    if (awErr || !aw || aw.artist_id !== effectiveArtist || aw.visibility !== "draft") {
      errors.push(item.artwork_id);
      continue;
    }

    const { error: upErr } = await auth.supabase.from("artworks").update(patch).eq("id", item.artwork_id);
    if (upErr) {
      errors.push(item.artwork_id);
      continue;
    }
    applied += 1;
  }

  await auth.supabase
    .from("website_import_sessions")
    .update({ status: "applied", updated_at: new Date().toISOString() })
    .eq("id", id);

  void recordUsageEvent(
    {
      key: USAGE_KEYS.IMPORT_WEBSITE_APPLIED,
      userId: auth.userId,
      metadata: { session_id: id, applied, errors: errors.length },
    },
    { client: auth.supabase, dualWriteBeta: false },
  );

  return NextResponse.json({ ok: true, applied, skipped: errors });
}
