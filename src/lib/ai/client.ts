import OpenAI from "openai";
import type { AiFeatureKey, AiDegradation } from "./types";
import { SAFETY_FOOTER, assertSafePrompt } from "./safety";

export const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const GENERATE_TIMEOUT_MS = 8_000;

let client: OpenAI | null = null;

export function getOpenAiClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!client) {
    client = new OpenAI({ apiKey: key, timeout: GENERATE_TIMEOUT_MS });
  }
  return client;
}

export type GenerateJsonOptions<T> = {
  feature: AiFeatureKey;
  system: string;
  user: string;
  /** Shape hint appended to the system prompt. */
  schemaHint: string;
  /** Client-side fallback when the key is missing, timeout hits, or parsing fails. */
  fallback: () => T;
  signal?: AbortSignal;
};

export type GenerateJsonResponse<T> = {
  data: T & AiDegradation;
  meta: {
    latencyMs: number;
    model: string;
    errorCode: string | null;
    contextSize: number;
  };
};

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  return trimmed;
}

function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(stripCodeFence(raw)) as T;
  } catch {
    const fenced = stripCodeFence(raw);
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(fenced.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Generate a typed JSON payload using OpenAI. Retries once on transient
 * failures, times out at GENERATE_TIMEOUT_MS, and never throws into the
 * caller — instead it returns the caller-provided `fallback` with
 * `degraded: true`. The caller is responsible for logging the event.
 */
export async function generateJSON<T extends object>(
  opts: GenerateJsonOptions<T>,
): Promise<GenerateJsonResponse<T>> {
  assertSafePrompt(opts.feature);
  const started = Date.now();
  const ai = getOpenAiClient();
  const contextSize = opts.system.length + opts.user.length + opts.schemaHint.length;

  if (!ai) {
    return {
      data: { ...opts.fallback(), degraded: true, reason: "no_key" },
      meta: { latencyMs: 0, model: DEFAULT_MODEL, errorCode: "no_key", contextSize },
    };
  }

  const systemMessage = `${SAFETY_FOOTER}\n\n${opts.system}\n\nRespond with a single JSON object matching this shape (no code fences, no prose): ${opts.schemaHint}`;

  const run = async () => {
    return ai.chat.completions.create(
      {
        model: DEFAULT_MODEL,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: opts.user },
        ],
      },
      { signal: opts.signal },
    );
  };

  let lastError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const resp = await run();
      const text = resp.choices?.[0]?.message?.content ?? "";
      const parsed = tryParseJson<T>(text);
      if (!parsed) {
        lastError = "parse";
        if (attempt === 0) continue;
        break;
      }
      return {
        data: parsed,
        meta: {
          latencyMs: Date.now() - started,
          model: DEFAULT_MODEL,
          errorCode: null,
          contextSize,
        },
      };
    } catch (err: unknown) {
      const anyErr = err as { name?: string; status?: number };
      const name = String(anyErr?.name ?? "");
      if (name === "APIUserAbortError" || name === "AbortError") {
        lastError = "timeout";
        break;
      }
      lastError = "error";
      if (attempt === 0 && (anyErr?.status ?? 0) >= 500) continue;
      break;
    }
  }

  const reason: AiDegradation["reason"] =
    lastError === "parse"
      ? "parse"
      : lastError === "timeout"
      ? "timeout"
      : "error";

  return {
    data: { ...opts.fallback(), degraded: true, reason },
    meta: {
      latencyMs: Date.now() - started,
      model: DEFAULT_MODEL,
      errorCode: lastError,
      contextSize,
    },
  };
}
