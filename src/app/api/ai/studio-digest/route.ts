import { handleAiRoute } from "@/lib/ai/route";
import { buildStudioDigestContext, type StudioDigestInput } from "@/lib/ai/contexts";
import { STUDIO_DIGEST_SCHEMA, STUDIO_DIGEST_SYSTEM } from "@/lib/ai/prompts";
import type { StudioDigestResult } from "@/lib/ai/types";

export const runtime = "nodejs";

type Body = { digest?: StudioDigestInput };

export async function POST(req: Request) {
  return handleAiRoute<Body, StudioDigestResult>(req, {
    feature: "studio_digest",
    async buildPromptInput({ body }) {
      const digest = body?.digest ?? {};
      return {
        system: STUDIO_DIGEST_SYSTEM,
        user: buildStudioDigestContext(digest),
        schemaHint: STUDIO_DIGEST_SCHEMA,
        fallback: () => ({ headline: "", changes: [], nextActions: [] }),
      };
    },
  });
}
