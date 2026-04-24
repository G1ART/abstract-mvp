import { NextResponse } from "next/server";
import { requireUserFromRequest } from "@/lib/websiteImport/supabaseServer";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserFromRequest(_req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const { data, error } = await auth.supabase
    .from("website_import_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "not_found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
