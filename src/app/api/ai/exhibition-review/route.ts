import { NextResponse } from "next/server";
import { handleAiRoute } from "@/lib/ai/route";
import {
  buildExhibitionReviewContext,
  type ExhibitionReviewInput,
} from "@/lib/ai/contexts";
import {
  EXHIBITION_REVIEW_SCHEMA,
  EXHIBITION_REVIEW_SYSTEM,
} from "@/lib/ai/prompts";
import type { ExhibitionReviewResult } from "@/lib/ai/types";
import {
  parseExhibitionReviewBody,
  type ExhibitionReviewBody,
} from "@/lib/ai/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * P1-B — Exhibition Review route.
 *
 * Authorisation: relies on `projects` RLS (row visible only to curator,
 * host, or active project-scope delegates). We add an explicit guard so
 * a user who is somehow able to read the row but isn't the curator/host
 * still can't drive a model run on a project they don't own.
 */
export async function POST(req: Request) {
  return handleAiRoute<ExhibitionReviewBody, ExhibitionReviewResult>(req, {
    feature: "exhibition_review",
    validateBody: (raw) => {
      const r = parseExhibitionReviewBody(raw);
      return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason };
    },
    async buildPromptInput({ body, userId, supabase }) {
      const { data: row, error: rowErr } = await supabase
        .from("projects")
        .select(
          "id, title, start_date, end_date, host_name, host_profile_id, curator_id, cover_image_paths, " +
            "curator:profiles!curator_id(display_name, username), " +
            "host:profiles!host_profile_id(display_name, username)",
        )
        .eq("id", body.exhibitionId)
        .eq("project_type", "exhibition")
        .single();

      if (rowErr || !row) {
        return NextResponse.json(
          { degraded: true, reason: "invalid_input", validation: "missing_exhibition" },
          { status: 404 },
        );
      }

      const rowAny = row as unknown as {
        curator_id?: string | null;
        host_profile_id?: string | null;
      };
      const isCurator =
        typeof rowAny.curator_id === "string" && rowAny.curator_id === userId;
      const isHost =
        typeof rowAny.host_profile_id === "string" && rowAny.host_profile_id === userId;

      if (!isCurator && !isHost) {
        // Active project-scope delegation may also unlock this. Check the
        // delegations table for an active project scope on this project.
        const { data: deleg } = await supabase
          .from("delegations")
          .select("id")
          .eq("delegate_profile_id", userId)
          .eq("status", "active")
          .or(
            `scope_type.eq.account,scope_type.eq.inventory,and(scope_type.eq.project,project_id.eq.${body.exhibitionId})`,
          )
          .limit(1);
        const allowed = Array.isArray(deleg) && deleg.length > 0;
        if (!allowed) {
          return NextResponse.json(
            { degraded: true, reason: "unauthorized" },
            { status: 403 },
          );
        }
      }

      const { data: worksRaw } = await supabase
        .from("exhibition_works")
        .select("work_id, artworks!work_id(id, title, year, medium)")
        .eq("exhibition_id", body.exhibitionId)
        .limit(20);

      const works: NonNullable<ExhibitionReviewInput["works"]> = [];
      for (const r of (worksRaw ?? []) as unknown as Array<Record<string, unknown>>) {
        const aw = r.artworks as
          | { id: string; title: string | null; year: string | number | null; medium: string | null }
          | null;
        if (aw && typeof aw === "object" && !Array.isArray(aw)) {
          works.push({
            id: aw.id,
            title: aw.title,
            year: aw.year,
            medium: aw.medium,
          });
        }
      }

      const r = row as unknown as {
        title: string | null;
        start_date: string | null;
        end_date: string | null;
        host_name: string | null;
        cover_image_paths: string[] | null;
        curator: { display_name: string | null; username: string | null } | null;
        host: { display_name: string | null; username: string | null } | null;
      };

      const ctx: ExhibitionReviewInput = {
        locale: body.locale,
        title: r.title ?? null,
        description: null,
        wallText: null,
        startDate: r.start_date ?? null,
        endDate: r.end_date ?? null,
        venueLabel: r.host_name ?? null,
        curatorLabel: r.curator?.display_name ?? r.curator?.username ?? null,
        hostLabel: r.host?.display_name ?? r.host?.username ?? null,
        hasCover: Array.isArray(r.cover_image_paths) && r.cover_image_paths.length > 0,
        workCount: works.length,
        works,
      };

      return {
        system: EXHIBITION_REVIEW_SYSTEM,
        user: buildExhibitionReviewContext(ctx),
        schemaHint: EXHIBITION_REVIEW_SCHEMA,
        fallback: () => ({ readiness: 0, issues: [] }),
      };
    },
  });
}
