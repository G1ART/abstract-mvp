import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/websiteImport/supabaseServer";

export const runtime = "nodejs";

/**
 * Mark a session as `cancelled`. The actual server-side scan/match work
 * runs inside a Vercel function we cannot easily abort from outside, but
 * cancelling the row is enough for the UI to stop polling and for the
 * stale-scan recovery (90s) check in the scan route to hand the slot back
 * to a fresh attempt.
 *
 * Idempotent: repeat calls are no-ops if the session is already terminal.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserFromRequest(_req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const { data: row, error: loadErr } = await auth.supabase
    .from("website_import_sessions")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (loadErr || !row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Don't bounce a session out of a terminal state, just acknowledge.
  const terminal = new Set(["applied", "cancelled", "failed"]);
  if (terminal.has(row.status as string)) {
    return NextResponse.json({ ok: true, status: row.status });
  }

  const { error: upErr } = await auth.supabase
    .from("website_import_sessions")
    .update({
      status: "cancelled",
      scan_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (upErr) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  return NextResponse.json({ ok: true, status: "cancelled" });
}
