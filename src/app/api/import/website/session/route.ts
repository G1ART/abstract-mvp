import { NextResponse } from "next/server";
import { normalizeWebsiteUrl } from "@/lib/websiteImport/urlSafety";
import { requireUserFromRequest } from "@/lib/websiteImport/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireUserFromRequest(req);
  if (!auth.ok) return auth.response;

  let body: { sourceUrl?: string; actingProfileId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const sourceUrlRaw = typeof body.sourceUrl === "string" ? body.sourceUrl : "";
  const norm = normalizeWebsiteUrl(sourceUrlRaw);
  if (!norm.ok) {
    return NextResponse.json({ error: "invalid_url", reason: norm.reason }, { status: 400 });
  }

  const actingRaw = typeof body.actingProfileId === "string" ? body.actingProfileId.trim() : "";
  const acting_profile_id =
    actingRaw && actingRaw !== auth.userId ? actingRaw : null;

  const { data, error } = await auth.supabase
    .from("website_import_sessions")
    .insert({
      user_id: auth.userId,
      acting_profile_id,
      source_url: norm.url.toString(),
      status: "created",
      candidates: [],
      match_rows: [],
      scan_meta: {},
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id as string });
}
