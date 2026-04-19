import { handleAiRoute } from "@/lib/ai/route";
import { buildProfileCopilotContext, type ProfileContextInput } from "@/lib/ai/contexts";
import {
  PROFILE_COPILOT_SCHEMA,
  PROFILE_COPILOT_SYSTEM,
} from "@/lib/ai/prompts";
import type { ProfileSuggestionsResult } from "@/lib/ai/types";

export const runtime = "nodejs";

type Body = { profile?: ProfileContextInput };

export async function POST(req: Request) {
  return handleAiRoute<Body, ProfileSuggestionsResult>(req, {
    feature: "profile_copilot",
    async buildPromptInput({ body }) {
      const profile = body?.profile ?? {};
      const user = buildProfileCopilotContext(profile);
      return {
        system: PROFILE_COPILOT_SYSTEM,
        user,
        schemaHint: PROFILE_COPILOT_SCHEMA,
        fallback: () => ({ completeness: 0, missing: [], suggestions: [] }),
      };
    },
  });
}
