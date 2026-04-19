import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateJSON } from "./client";
import { AiSoftCapError, checkDailySoftCap } from "./softCap";
import { logAiEvent } from "./events";
import { assertSafePrompt } from "./safety";
import type { AiDegradation, AiFeatureKey } from "./types";

export type RouteHandlerInput<TBody> = {
  feature: AiFeatureKey;
  /** JSON body type. The caller is responsible for validating shape. */
  body: TBody;
  userId: string;
  supabase: SupabaseClient;
  accessToken: string;
};

export type RouteHandlerDefinition<TBody, TResult extends AiDegradation> = {
  feature: AiFeatureKey;
  buildPromptInput: (
    input: RouteHandlerInput<TBody>,
  ) => Promise<{ system: string; user: string; schemaHint: string; fallback: () => TResult } | NextResponse>;
};

function buildSupabaseForToken(token: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function handleAiRoute<TBody, TResult extends AiDegradation>(
  req: Request,
  def: RouteHandlerDefinition<TBody, TResult>,
): Promise<NextResponse> {
  try {
    assertSafePrompt(def.feature);

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = buildSupabaseForToken(token);
    if (!supabase) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: TBody;
    try {
      body = (await req.json()) as TBody;
    } catch {
      body = {} as TBody;
    }

    try {
      await checkDailySoftCap(supabase, user.id);
    } catch (err) {
      if (err instanceof AiSoftCapError) {
        await logAiEvent(supabase, {
          user_id: user.id,
          feature_key: def.feature,
          error_code: "cap",
        });
        return NextResponse.json(
          { degraded: true, reason: "cap", error: "Soft cap reached" },
          { status: 429 },
        );
      }
      throw err;
    }

    const prepared = await def.buildPromptInput({
      feature: def.feature,
      body,
      userId: user.id,
      supabase,
      accessToken: token,
    });

    if (prepared instanceof NextResponse) return prepared;

    const hasKey = Boolean(process.env.OPENAI_API_KEY);
    if (!hasKey) {
      await logAiEvent(supabase, {
        user_id: user.id,
        feature_key: def.feature,
        error_code: "no_key",
      });
      return NextResponse.json(
        { ...prepared.fallback(), degraded: true, reason: "no_key" },
        { status: 503 },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let result;
    try {
      result = await generateJSON<TResult>({
        feature: def.feature,
        system: prepared.system,
        user: prepared.user,
        schemaHint: prepared.schemaHint,
        fallback: prepared.fallback,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    await logAiEvent(supabase, {
      user_id: user.id,
      feature_key: def.feature,
      context_size: result.meta.contextSize,
      model: result.meta.model,
      latency_ms: result.meta.latencyMs,
      error_code: result.meta.errorCode,
    });

    return NextResponse.json(result.data, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ai/route] unexpected", err);
    return NextResponse.json(
      { degraded: true, reason: "error", error: "Unexpected error" },
      { status: 500 },
    );
  }
}
