import { handleAiRoute } from "@/lib/ai/route";
import {
  buildInquiryReplyContext,
  type InquiryReplyInput,
} from "@/lib/ai/contexts";
import { INQUIRY_REPLY_SCHEMA, INQUIRY_REPLY_SYSTEM } from "@/lib/ai/prompts";
import type { InquiryReplyDraftResult } from "@/lib/ai/types";
import { parseInquiryBody } from "@/lib/ai/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handleAiRoute<InquiryReplyInput, InquiryReplyDraftResult>(req, {
    feature: "inquiry_reply_draft",
    validateBody: (raw) => {
      const r = parseInquiryBody(raw);
      if (!r.ok) return { ok: false, reason: r.reason };
      const { artwork, ...rest } = r.value;
      const value: InquiryReplyInput = {
        ...rest,
        artwork: artwork ?? undefined,
      };
      return { ok: true, value };
    },
    async buildPromptInput({ body }) {
      return {
        system: INQUIRY_REPLY_SYSTEM,
        user: buildInquiryReplyContext(body),
        schemaHint: INQUIRY_REPLY_SCHEMA,
        fallback: () => ({
          tone: body.tone,
          kind: body.kind,
          drafts: [],
        }),
      };
    },
  });
}
