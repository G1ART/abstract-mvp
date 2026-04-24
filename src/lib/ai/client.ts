import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";
import type { AiFeatureKey, AiDegradation } from "./types";
import { SAFETY_FOOTER, assertSafePrompt } from "./safety";

const CONFIGURED_MODEL = (process.env.OPENAI_MODEL ?? "").trim();
export const DEFAULT_MODEL = CONFIGURED_MODEL || "gpt-4o-mini";
/**
 * OpenAI chat completion budget (SDK client + AbortSignal in handleAiRoute).
 * 8s was too tight for JSON-mode portfolio hints in production; keep below
 * maxDuration on each `app/api/ai/.../route.ts` segment (60s).
 */
export const GENERATE_TIMEOUT_MS = 45_000;

// Log the model in use on first module load so Vercel Function logs always
// show which model is active. Helps catch misconfigurations (e.g. typos in
// OPENAI_MODEL env var) without requiring a failed request.
if (process.env.OPENAI_API_KEY) {
  console.info("[ai/client] model=%s (env=%s)", DEFAULT_MODEL, CONFIGURED_MODEL || "(default)");
}

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
        /** Portfolio / profile JSON payloads need headroom beyond the default cap. */
        max_completion_tokens: 2048,
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
      if (err instanceof APIUserAbortError) {
        lastError = "timeout";
        break;
      }
      if (err instanceof APIConnectionTimeoutError || err instanceof APIConnectionError) {
        lastError = "timeout";
        break;
      }
      if (err instanceof RateLimitError) {
        lastError = "rate_limit";
        break;
      }
      if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
        lastError = "upstream_auth";
        break;
      }
      if (err instanceof BadRequestError) {
        const e = err as APIError;
        const msg = String(e.message ?? "").toLowerCase();
        const code = String(e.code ?? "").toLowerCase();
        if (
          code.includes("context_length") ||
          code.includes("string_above_max_length") ||
          msg.includes("context length") ||
          msg.includes("maximum context") ||
          msg.includes("too many tokens") ||
          msg.includes("reduce the length") ||
          msg.includes("token count")
        ) {
          lastError = "context_limit";
        } else {
          lastError = "error";
        }
        console.error("[ai/client] OpenAI BadRequest", {
          feature: opts.feature,
          model: DEFAULT_MODEL,
          attempt,
          code: e.code,
          message: e.message,
        });
        break;
      }
      if (err instanceof APIError) {
        const e = err as APIError;
        if (e.status === 429) {
          lastError = "rate_limit";
          break;
        }
        if (e.status === 401 || e.status === 403) {
          lastError = "upstream_auth";
          break;
        }
        console.error("[ai/client] OpenAI call failed", {
          feature: opts.feature,
          model: DEFAULT_MODEL,
          attempt,
          status: e.status,
          code: e.code,
          message: e.message,
        });
        lastError = "error";
        if (attempt === 0 && (e.status ?? 0) >= 500) continue;
        break;
      }
      const anyErr = err as { name?: string; status?: number; message?: string };
      const name = String(anyErr?.name ?? "");
      if (name === "AbortError") {
        lastError = "timeout";
        break;
      }
      console.error("[ai/client] OpenAI call failed", {
        feature: opts.feature,
        model: DEFAULT_MODEL,
        attempt,
        status: anyErr?.status,
        name: anyErr?.name,
        message: anyErr?.message,
      });
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
        : lastError === "rate_limit"
          ? "rate_limit"
          : lastError === "context_limit"
            ? "context_limit"
            : lastError === "upstream_auth"
              ? "upstream_auth"
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
