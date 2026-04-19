import { handleAiRoute } from "@/lib/ai/route";
import {
  buildInquiryReplyContext,
  type InquiryReplyInput,
} from "@/lib/ai/contexts";
import { INQUIRY_REPLY_SCHEMA, INQUIRY_REPLY_SYSTEM } from "@/lib/ai/prompts";
import type { InquiryReplyDraftResult } from "@/lib/ai/types";

export const runtime = "nodejs";

type Body = { inquiry?: InquiryReplyInput };

export async function POST(req: Request) {
  return handleAiRoute<Body, InquiryReplyDraftResult>(req, {
    feature: "inquiry_reply_draft",
    async buildPromptInput({ body }) {
      const inquiry: InquiryReplyInput =
        body?.inquiry ?? { tone: "warm", kind: "reply" };
      return {
        system: INQUIRY_REPLY_SYSTEM,
        user: buildInquiryReplyContext(inquiry),
        schemaHint: INQUIRY_REPLY_SCHEMA,
        fallback: () => ({
          tone: inquiry.tone,
          kind: inquiry.kind,
          drafts: [],
        }),
      };
    },
  });
}
