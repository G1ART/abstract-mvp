import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWebsiteUrl } from "@/lib/websiteImport/urlSafety";
import { requireUserFromRequest } from "@/lib/websiteImport/supabaseServer";

export const runtime = "nodejs";

/**
 * Permissions string we require on the delegation row before letting a
 * delegate spin up an import session that targets the delegator's profile.
 *
 * We deliberately use `manage_works` (and not just `edit_metadata`) because
 * a website import session can drive bulk metadata writes onto an
 * artist's draft artworks, which is functionally equivalent to managing
 * works on their behalf.
 */
const REQUIRED_PERMISSION = "manage_works";

/**
 * Verify that the caller is allowed to act as `targetProfileId`.
 *
 * Allows when ANY of:
 *  - the caller IS the target (no delegation needed)
 *  - the caller has an active `account` scope delegation FROM the target
 *    that includes `manage_works` permission.
 *  - the caller has an active `inventory` scope delegation FROM the target
 *    that includes `manage_works` permission.
 *
 * We do NOT accept `project` scope here because website import is broader
 * than a single exhibition / project — it touches the artist's portfolio.
 */
async function userMayActAs(
  client: SupabaseClient,
  callerId: string,
  targetProfileId: string,
): Promise<boolean> {
  if (callerId === targetProfileId) return true;
  const { data, error } = await client
    .from("delegations")
    .select("id, scope_type, permissions, status")
    .eq("delegator_profile_id", targetProfileId)
    .eq("delegate_profile_id", callerId)
    .eq("status", "active")
    .in("scope_type", ["account", "inventory"]);
  if (error || !Array.isArray(data)) return false;
  for (const d of data as { permissions: string[] | null }[]) {
    if (Array.isArray(d.permissions) && d.permissions.includes(REQUIRED_PERMISSION)) {
      return true;
    }
  }
  return false;
}

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
  const acting_profile_id = actingRaw && actingRaw !== auth.userId ? actingRaw : null;

  // Pre-flight delegation check. RLS still gates the write, but doing the
  // check here lets us return a clean 403 instead of a 500 / silent
  // permission failure that confuses the client.
  if (acting_profile_id) {
    const allowed = await userMayActAs(auth.supabase, auth.userId, acting_profile_id);
    if (!allowed) {
      return NextResponse.json({ error: "delegation_not_authorized" }, { status: 403 });
    }
  }

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
