import { handleAiRoute } from "@/lib/ai/route";
import { buildBioDraftContext, type BioDraftInput } from "@/lib/ai/contexts";
import { BIO_DRAFT_SCHEMA, BIO_DRAFT_SYSTEM } from "@/lib/ai/prompts";
import type { BioDraftResult } from "@/lib/ai/types";
import { parseBioBody } from "@/lib/ai/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handleAiRoute<BioDraftInput, BioDraftResult>(req, {
    feature: "bio_draft",
    validateBody: (raw) => {
      const r = parseBioBody(raw);
      return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason };
    },
    async buildPromptInput({ body }) {
      return {
        system: BIO_DRAFT_SYSTEM,
        user: buildBioDraftContext(body),
        schemaHint: BIO_DRAFT_SCHEMA,
        fallback: () => ({ tone: body.tone, drafts: [] }),
      };
    },
  });
}
