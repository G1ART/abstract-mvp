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

export const runtime = "nodejs";

type Body = { portfolio?: PortfolioContextInput };

export async function POST(req: Request) {
  return handleAiRoute<Body, PortfolioSuggestionsResult>(req, {
    feature: "portfolio_copilot",
    async buildPromptInput({ body }) {
      const portfolio = body?.portfolio ?? { artworks: [], exhibitions: [] };
      const user = buildPortfolioCopilotContext(portfolio);
      return {
        system: PORTFOLIO_COPILOT_SYSTEM,
        user,
        schemaHint: PORTFOLIO_COPILOT_SCHEMA,
        fallback: () => ({ suggestions: [] }),
      };
    },
  });
}
