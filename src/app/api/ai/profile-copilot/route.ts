import { handleAiRoute } from "@/lib/ai/route";
import { buildProfileCopilotContext, type ProfileContextInput } from "@/lib/ai/contexts";
import {
  PROFILE_COPILOT_SCHEMA,
  PROFILE_COPILOT_SYSTEM,
  PROFILE_STATEMENT_SYSTEM,
} from "@/lib/ai/prompts";
import type { ProfileSuggestionsResult } from "@/lib/ai/types";
import { parseProfileBody } from "@/lib/ai/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  return handleAiRoute<ProfileContextInput, ProfileSuggestionsResult>(req, {
    feature: "profile_copilot",
    validateBody: (raw) => {
      const r = parseProfileBody(raw);
      return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason };
    },
    async buildPromptInput({ body }) {
      const user = buildProfileCopilotContext(body);
      const isStatement = body.mode === "statement";
      return {
        system: isStatement ? PROFILE_STATEMENT_SYSTEM : PROFILE_COPILOT_SYSTEM,
        user,
        schemaHint: PROFILE_COPILOT_SCHEMA,
        fallback: () =>
          isStatement
            ? {
                completeness: 0,
                missing: [],
                suggestions: [],
                statementDrafts: [],
              }
            : {
                completeness: 0,
                missing: [],
                suggestions: [],
                bioDrafts: [],
                headlineDrafts: [],
              },
      };
    },
  });
}
