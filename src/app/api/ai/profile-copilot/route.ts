import { handleAiRoute } from "@/lib/ai/route";
import { buildProfileCopilotContext, type ProfileContextInput } from "@/lib/ai/contexts";
import {
  PROFILE_COPILOT_SCHEMA,
  PROFILE_COPILOT_SYSTEM,
} from "@/lib/ai/prompts";
import type { ProfileSuggestionsResult } from "@/lib/ai/types";
import { parseProfileBody } from "@/lib/ai/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handleAiRoute<ProfileContextInput, ProfileSuggestionsResult>(req, {
    feature: "profile_copilot",
    validateBody: (raw) => {
      const r = parseProfileBody(raw);
      return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason };
    },
    async buildPromptInput({ body }) {
      const user = buildProfileCopilotContext(body);
      return {
        system: PROFILE_COPILOT_SYSTEM,
        user,
        schemaHint: PROFILE_COPILOT_SCHEMA,
        fallback: () => ({ completeness: 0, missing: [], suggestions: [] }),
      };
    },
  });
}
