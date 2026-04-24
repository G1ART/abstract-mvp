import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/websiteImport/supabaseServer";
import type { WebsiteImportCandidate, WebsiteImportMatchRow } from "@/lib/websiteImport/types";
import { rebuildRowWithCandidate } from "@/lib/websiteImport/matchEngine";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserFromRequest(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let artworkId: string | null = null;
  let candidateId: string | null | undefined = undefined;
  try {
    const body = await req.json();
    if (typeof body?.artworkId === "string") artworkId = body.artworkId;
    if (body?.candidateId === null) candidateId = null;
    else if (typeof body?.candidateId === "string") candidateId = body.candidateId;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!artworkId) {
    return NextResponse.json({ error: "artworkId_required" }, { status: 400 });
  }
  if (candidateId === undefined) {
    return NextResponse.json({ error: "candidateId_required" }, { status: 400 });
  }

  const { data: session, error } = await auth.supabase
    .from("website_import_sessions")
    .select("match_rows, candidates")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error || !session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const candidates = (Array.isArray(session.candidates) ? session.candidates : []) as WebsiteImportCandidate[];
  const rows = (Array.isArray(session.match_rows) ? session.match_rows : []) as WebsiteImportMatchRow[];
  const idx = rows.findIndex((r) => r.artwork_id === artworkId);
  if (idx < 0) {
    return NextResponse.json({ error: "row_not_found" }, { status: 404 });
  }

  let nextRow: WebsiteImportMatchRow;
  if (candidateId === null) {
    nextRow = rebuildRowWithCandidate(rows[idx]!, undefined);
  } else {
    const cand = candidates.find((c) => c.id === candidateId);
    if (!cand) {
      return NextResponse.json({ error: "candidate_not_found" }, { status: 400 });
    }
    nextRow = rebuildRowWithCandidate(rows[idx]!, cand);
  }

  const nextRows = [...rows];
  nextRows[idx] = nextRow;

  await auth.supabase
    .from("website_import_sessions")
    .update({ match_rows: nextRows, updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true, row: nextRow });
}
