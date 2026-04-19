import { handleAiRoute } from "@/lib/ai/route";
import { buildStudioDigestContext, type StudioDigestInput } from "@/lib/ai/contexts";
import { STUDIO_DIGEST_SCHEMA, STUDIO_DIGEST_SYSTEM } from "@/lib/ai/prompts";
import type { StudioDigestResult } from "@/lib/ai/types";
import { parseDigestBody } from "@/lib/ai/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handleAiRoute<StudioDigestInput, StudioDigestResult>(req, {
    feature: "studio_digest",
    validateBody: (raw) => {
      const r = parseDigestBody(raw);
      return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason };
    },
    async buildPromptInput({ body }) {
      return {
        system: STUDIO_DIGEST_SYSTEM,
        user: buildStudioDigestContext(body),
        schemaHint: STUDIO_DIGEST_SCHEMA,
        fallback: () => ({ headline: "", changes: [], nextActions: [] }),
      };
    },
  });
}
