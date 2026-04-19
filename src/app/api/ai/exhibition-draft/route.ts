import { handleAiRoute } from "@/lib/ai/route";
import {
  buildExhibitionProducerContext,
  type ExhibitionDraftInput,
} from "@/lib/ai/contexts";
import { EXHIBITION_DRAFT_SCHEMA, EXHIBITION_DRAFT_SYSTEM } from "@/lib/ai/prompts";
import type { ExhibitionDraftResult } from "@/lib/ai/types";

export const runtime = "nodejs";

type Body = { exhibition?: ExhibitionDraftInput };

export async function POST(req: Request) {
  return handleAiRoute<Body, ExhibitionDraftResult>(req, {
    feature: "exhibition_draft",
    async buildPromptInput({ body }) {
      const exhibition: ExhibitionDraftInput =
        body?.exhibition ?? { kind: "description" };
      return {
        system: EXHIBITION_DRAFT_SYSTEM,
        user: buildExhibitionProducerContext(exhibition),
        schemaHint: EXHIBITION_DRAFT_SCHEMA,
        fallback: () => ({ kind: exhibition.kind, drafts: [] }),
      };
    },
  });
}
