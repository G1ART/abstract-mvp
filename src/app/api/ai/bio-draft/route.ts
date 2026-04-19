import { handleAiRoute } from "@/lib/ai/route";
import { buildBioDraftContext, type BioDraftInput } from "@/lib/ai/contexts";
import { BIO_DRAFT_SCHEMA, BIO_DRAFT_SYSTEM } from "@/lib/ai/prompts";
import type { BioDraftResult } from "@/lib/ai/types";

export const runtime = "nodejs";

type Body = { bio?: BioDraftInput };

export async function POST(req: Request) {
  return handleAiRoute<Body, BioDraftResult>(req, {
    feature: "bio_draft",
    async buildPromptInput({ body }) {
      const bio: BioDraftInput = body?.bio ?? { tone: "concise" };
      return {
        system: BIO_DRAFT_SYSTEM,
        user: buildBioDraftContext(bio),
        schemaHint: BIO_DRAFT_SCHEMA,
        fallback: () => ({ tone: bio.tone ?? "concise", drafts: [] }),
      };
    },
  });
}
