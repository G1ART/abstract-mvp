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

export const runtime = "nodejs";

type Body = { matchmaker?: MatchmakerRationaleInput };

export async function POST(req: Request) {
  return handleAiRoute<Body, MatchmakerRationalesResult>(req, {
    feature: "matchmaker_rationales",
    async buildPromptInput({ body }) {
      const matchmaker: MatchmakerRationaleInput =
        body?.matchmaker ?? { me: {}, candidates: [] };
      return {
        system: MATCHMAKER_RATIONALES_SYSTEM,
        user: buildMatchmakerRationaleContext(matchmaker),
        schemaHint: MATCHMAKER_RATIONALES_SCHEMA,
        fallback: () => ({ rationales: [] }),
      };
    },
  });
}
