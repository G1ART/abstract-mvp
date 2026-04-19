import { handleAiRoute } from "@/lib/ai/route";
import {
  buildMatchmakerRationaleContext,
  type MatchmakerRationaleInput,
} from "@/lib/ai/contexts";
import {
  MATCHMAKER_RATIONALES_SCHEMA,
  MATCHMAKER_RATIONALES_SYSTEM,
} from "@/lib/ai/prompts";
import type { MatchmakerRationalesResult } from "@/lib/ai/types";
import { parseMatchmakerBody } from "@/lib/ai/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handleAiRoute<MatchmakerRationaleInput, MatchmakerRationalesResult>(req, {
    feature: "matchmaker_rationales",
    validateBody: (raw) => {
      const r = parseMatchmakerBody(raw);
      return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason };
    },
    async buildPromptInput({ body }) {
      return {
        system: MATCHMAKER_RATIONALES_SYSTEM,
        user: buildMatchmakerRationaleContext(body),
        schemaHint: MATCHMAKER_RATIONALES_SCHEMA,
        fallback: () => ({ rationales: [] }),
      };
    },
  });
}
