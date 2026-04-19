import { handleAiRoute } from "@/lib/ai/route";
import {
  buildExhibitionProducerContext,
  type ExhibitionDraftInput,
} from "@/lib/ai/contexts";
import { EXHIBITION_DRAFT_SCHEMA, EXHIBITION_DRAFT_SYSTEM } from "@/lib/ai/prompts";
import type { ExhibitionDraftResult } from "@/lib/ai/types";
import { parseExhibitionBody } from "@/lib/ai/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handleAiRoute<ExhibitionDraftInput, ExhibitionDraftResult>(req, {
    feature: "exhibition_draft",
    validateBody: (raw) => {
      const r = parseExhibitionBody(raw);
      return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason };
    },
    async buildPromptInput({ body }) {
      return {
        system: EXHIBITION_DRAFT_SYSTEM,
        user: buildExhibitionProducerContext(body),
        schemaHint: EXHIBITION_DRAFT_SCHEMA,
        fallback: () => ({ kind: body.kind, drafts: [] }),
      };
    },
  });
}
