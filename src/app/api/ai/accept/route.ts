import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { markAiEventAccepted } from "@/lib/ai/events";

export const runtime = "nodejs";

/**
 * Flip `ai_events.accepted = true` on an owner's own row.
 *
 * This is the canonical "user adopted the draft" signal. Every AI surface
 * should go through the centralized helper at `src/lib/ai/accept.ts`
 * (`markAiAccepted`) instead of calling this route directly — the helper
 * also emits the sibling `logBetaEvent("ai_accepted", {...})` so the
 * telemetry view and the beta dashboard stay in sync.
 *
 * The helper in `src/lib/ai/browser.ts` (`acceptAiEvent`) is the low-level
 * fetch wrapper; it is still exported so existing integrations work, but
 * new call sites should use `markAiAccepted` in `src/lib/ai/accept.ts`.
 *
 * Safety notes:
 *   - Bearer-JWT path is identical to every other `/api/ai/*` route.
 *   - Only `accepted` is written. Other columns remain immutable from API.
 *   - Owner-RLS (`ai_events_update_own`) guarantees a user cannot flip
 *     someone else's row even if they guess a UUID.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
    if (!token) {
      return NextResponse.json(
        { degraded: true, reason: "unauthorized" },
        { status: 401 },
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json(
        { degraded: true, reason: "error", error: "Server misconfigured" },
        { status: 500 },
      );
    }

    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json(
        { degraded: true, reason: "unauthorized" },
        { status: 401 },
      );
    }

    let payload: { aiEventId?: unknown } = {};
    try {
      payload = (await req.json()) as { aiEventId?: unknown };
    } catch {
      payload = {};
    }

    const aiEventId =
      typeof payload.aiEventId === "string" && payload.aiEventId.trim().length
        ? payload.aiEventId.trim()
        : null;
    if (!aiEventId) {
      return NextResponse.json(
        { degraded: true, reason: "invalid_input", validation: "missing_aiEventId" },
        { status: 400 },
      );
    }

    const ok = await markAiEventAccepted(supabase, user.id, aiEventId);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch (err) {
    console.error("[ai/accept] unexpected", err);
    return NextResponse.json(
      { degraded: true, reason: "error", error: "Unexpected error" },
      { status: 500 },
    );
  }
}
