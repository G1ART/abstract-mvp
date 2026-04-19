import { handleAiRoute } from "@/lib/ai/route";
import {
  buildIntroMessageContext,
  type IntroMessageInput,
} from "@/lib/ai/contexts";
import { INTRO_MESSAGE_SCHEMA, INTRO_MESSAGE_SYSTEM } from "@/lib/ai/prompts";
import type { IntroMessageDraftResult } from "@/lib/ai/types";

export const runtime = "nodejs";

type Body = { intro?: IntroMessageInput };

export async function POST(req: Request) {
  return handleAiRoute<Body, IntroMessageDraftResult>(req, {
    feature: "intro_message_draft",
    async buildPromptInput({ body }) {
      const intro: IntroMessageInput =
        body?.intro ?? { me: {}, recipient: {} };
      return {
        system: INTRO_MESSAGE_SYSTEM,
        user: buildIntroMessageContext(intro),
        schemaHint: INTRO_MESSAGE_SCHEMA,
        fallback: () => ({ drafts: [] }),
      };
    },
  });
}
