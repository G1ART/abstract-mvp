import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/websiteImport/supabaseServer";
import type {
  WebsiteImportCandidate,
  WebsiteImportMatchRow,
  WebsiteImportParsedFields,
} from "@/lib/websiteImport/types";
import { recordUsageEvent } from "@/lib/metering/recordUsageEvent";
import { USAGE_KEYS } from "@/lib/metering/usageKeys";

export const runtime = "nodejs";
export const maxDuration = 60;

const APPLY_CONCURRENCY = 4;

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

  let items: ApplyItem[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.items)) items = body.items;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { data: session, error: sErr } = await auth.supabase
    .from("website_import_sessions")
    .select("match_rows, candidates, acting_profile_id, status")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (sErr || !session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const previousStatus = (session.status as string | null) ?? "matched";
  const candidates = (Array.isArray(session.candidates) ? session.candidates : []) as WebsiteImportCandidate[];
  const matchRows = (Array.isArray(session.match_rows) ? session.match_rows : []) as WebsiteImportMatchRow[];
  const effectiveArtist = (session.acting_profile_id as string | null) ?? auth.userId;

  // Filter eligible items up-front, dedupe by artwork_id (last write wins).
  const eligibleMap = new Map<string, ApplyItem>();
  for (const item of items) {
    if (!item?.artwork_id || !item.apply) continue;
    eligibleMap.set(item.artwork_id, item);
  }
  const eligibleIds = [...eligibleMap.keys()];

  if (eligibleIds.length === 0) {
    return NextResponse.json({ ok: true, applied: 0, skipped: [] });
  }

  // Single batched ownership/visibility lookup instead of N round-trips.
  const { data: ownerships, error: ownErr } = await auth.supabase
    .from("artworks")
    .select("id, artist_id, visibility")
    .in("id", eligibleIds);

  if (ownErr || !ownerships) {
    return NextResponse.json({ error: "ownership_check_failed" }, { status: 500 });
  }
  const ownById = new Map<string, { artist_id: string; visibility: string | null }>(
    (ownerships as { id: string; artist_id: string; visibility: string | null }[]).map((r) => [r.id, r]),
  );

  type ApplyOutcome = { id: string; applied: boolean; reason?: string };
  const outcomes = await runWithLimit<ApplyItem, ApplyOutcome>(
    [...eligibleMap.values()],
    APPLY_CONCURRENCY,
    async (item) => {
      const own = ownById.get(item.artwork_id);
      if (!own || own.artist_id !== effectiveArtist || own.visibility !== "draft") {
        return { id: item.artwork_id, applied: false, reason: "not_owner_or_not_draft" };
      }
      const row = matchRows.find((r) => r.artwork_id === item.artwork_id);
      if (!row || row.match_status === "no_match") {
        return { id: item.artwork_id, applied: false, reason: "no_match" };
      }
      const chosenId =
        item.chosen_candidate_id !== undefined && item.chosen_candidate_id !== null
          ? item.chosen_candidate_id
          : row.chosen_candidate_id;

      const cand = chosenId ? candidates.find((c) => c.id === chosenId) : null;
      const baseParsed = cand?.parsed ?? (row.proposed ? row.proposed : null);

      const merged = mergeProposed(baseParsed, item.overrides);
      const hasPayload =
        (merged.title != null && String(merged.title).trim().length > 0) ||
        (merged.year != null && Number.isFinite(merged.year)) ||
        (merged.medium != null && String(merged.medium).trim().length > 0) ||
        (merged.size != null && String(merged.size).trim().length > 0) ||
        (merged.story != null && String(merged.story).trim().length > 0);
      if (!hasPayload) return { id: item.artwork_id, applied: false, reason: "empty_payload" };

      const provenance = {
        source: "website_import",
        session_id: id,
        source_page_url: cand?.page_url ?? row.source_page_url ?? null,
        source_image_url: cand?.image_url ?? row.source_image_url ?? null,
        raw_caption: cand?.caption_blob ?? row.raw_caption ?? null,
        match_status: row.match_status ?? null,
        confidence: row.confidence ?? null,
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

      // Server-side guarded update: ownership & draft already pre-checked,
      // but the WHERE clause keeps us safe against race conditions where a
      // user just published or transferred the artwork between the
      // ownership read and this write.
      const { error: upErr, count } = await auth.supabase
        .from("artworks")
        .update(patch, { count: "exact" })
        .eq("id", item.artwork_id)
        .eq("artist_id", effectiveArtist)
        .eq("visibility", "draft");
      if (upErr) return { id: item.artwork_id, applied: false, reason: "update_failed" };
      if (typeof count === "number" && count === 0) {
        return { id: item.artwork_id, applied: false, reason: "row_disappeared" };
      }
      return { id: item.artwork_id, applied: true };
    },
  );

  const applied = outcomes.filter((o) => o.applied).length;
  const errors = outcomes.filter((o) => !o.applied).map((o) => o.id);

  // Don't downgrade the session label to "applied" if literally nothing
  // landed — that confuses the UI ("Applied!" with zero changes). Restore
  // the previous label so the user can re-try on the same session.
  const nextStatus = applied > 0 ? "applied" : previousStatus;

  await auth.supabase
    .from("website_import_sessions")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
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
