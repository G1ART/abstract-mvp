import { handleAiRoute } from "@/lib/ai/route";
import {
  buildPortfolioCopilotContext,
  type PortfolioContextInput,
} from "@/lib/ai/contexts";
import {
  PORTFOLIO_COPILOT_SCHEMA,
  PORTFOLIO_COPILOT_SYSTEM,
} from "@/lib/ai/prompts";
import type { PortfolioSuggestionsResult } from "@/lib/ai/types";
import { parsePortfolioBody } from "@/lib/ai/validation";

export const runtime = "nodejs";
/** Allow OpenAI JSON completions to finish (see `GENERATE_TIMEOUT_MS` in `lib/ai/client`). */
export const maxDuration = 60;

export async function POST(req: Request) {
  return handleAiRoute<PortfolioContextInput, PortfolioSuggestionsResult>(req, {
    feature: "portfolio_copilot",
    validateBody: (raw) => {
      const r = parsePortfolioBody(raw);
      return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason };
    },
    async buildPromptInput({ body }) {
      return {
        system: PORTFOLIO_COPILOT_SYSTEM,
        user: buildPortfolioCopilotContext(body),
        schemaHint: PORTFOLIO_COPILOT_SCHEMA,
        fallback: () => ({ suggestions: [] }),
      };
    },
  });
}
