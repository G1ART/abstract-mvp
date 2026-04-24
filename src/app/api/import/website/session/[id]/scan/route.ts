import { NextResponse } from "next/server";
import { crawlPortfolioSite } from "@/lib/websiteImport/crawlSite";
import { normalizeWebsiteUrl } from "@/lib/websiteImport/urlSafety";
import { requireUserFromRequest } from "@/lib/websiteImport/supabaseServer";
import { recordUsageEvent } from "@/lib/metering/recordUsageEvent";
import { USAGE_KEYS } from "@/lib/metering/usageKeys";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserFromRequest(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const { data: row, error: loadErr } = await auth.supabase
    .from("website_import_sessions")
    .select("id, source_url, status, user_id")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (loadErr || !row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const norm = normalizeWebsiteUrl(row.source_url as string);
  if (!norm.ok) {
    return NextResponse.json({ error: "invalid_stored_url" }, { status: 400 });
  }

  await auth.supabase
    .from("website_import_sessions")
    .update({ status: "scanning", scan_error: null, updated_at: new Date().toISOString() })
    .eq("id", id);

  const crawled = await crawlPortfolioSite(norm.url);
  if (!crawled.ok) {
    await auth.supabase
      .from("website_import_sessions")
      .update({
        status: "failed",
        scan_error: crawled.error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return NextResponse.json({ error: crawled.error }, { status: 422 });
  }

  await auth.supabase
    .from("website_import_sessions")
    .update({
      status: "scan_done",
      candidates: crawled.candidates,
      scan_meta: crawled.scan_meta,
      scan_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  void recordUsageEvent(
    {
      key: USAGE_KEYS.IMPORT_WEBSITE_SCANNED,
      userId: auth.userId,
      metadata: {
        session_id: id,
        pages: crawled.scan_meta.pages_fetched,
        candidates: crawled.candidates.length,
      },
    },
    { client: auth.supabase, dualWriteBeta: false },
  );

  return NextResponse.json({
    ok: true,
    candidateCount: crawled.candidates.length,
    scan_meta: crawled.scan_meta,
  });
}
