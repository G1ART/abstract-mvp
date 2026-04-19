import { handleAiRoute } from "@/lib/ai/route";
import {
  buildIntroMessageContext,
  type IntroMessageInput,
} from "@/lib/ai/contexts";
import { INTRO_MESSAGE_SCHEMA, INTRO_MESSAGE_SYSTEM } from "@/lib/ai/prompts";
import type { IntroMessageDraftResult } from "@/lib/ai/types";
import { parseIntroBody } from "@/lib/ai/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handleAiRoute<IntroMessageInput, IntroMessageDraftResult>(req, {
    feature: "intro_message_draft",
    validateBody: (raw) => {
      const r = parseIntroBody(raw);
      return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason };
    },
    async buildPromptInput({ body }) {
      return {
        system: INTRO_MESSAGE_SYSTEM,
        user: buildIntroMessageContext(body),
        schemaHint: INTRO_MESSAGE_SCHEMA,
        fallback: () => ({ drafts: [] }),
      };
    },
  });
}
