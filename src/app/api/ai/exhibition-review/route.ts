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
 * Deterministic fallback: when the model is unavailable we still return
 * a useful checklist computed from real exhibition fields. No prose is
 * invented; each issue references a known-missing or known-thin field.
 */
function buildExhibitionReviewFallback(
  ctx: ExhibitionReviewInput,
): ExhibitionReviewResult {
  const isKo = ctx.locale === "ko";
  const issues: ExhibitionReviewResult["issues"] = [];

  const checks: Array<{
    id: string;
    code: string;
    pass: boolean;
    severity: "info" | "suggest" | "warn";
    msgKo: string;
    msgEn: string;
  }> = [
    {
      id: "title",
      code: "missing_title",
      pass: typeof ctx.title === "string" && ctx.title.trim().length > 0,
      severity: "warn",
      msgKo: "전시 제목이 비어 있어요.",
      msgEn: "The exhibition title is empty.",
    },
    {
      id: "dates",
      code: "missing_dates",
      pass: !!ctx.startDate && !!ctx.endDate,
      severity: "warn",
      msgKo: "전시 기간(시작/종료일)이 채워져 있지 않아요.",
      msgEn: "Start or end date is missing.",
    },
    {
      id: "venue",
      code: "missing_venue",
      pass: typeof ctx.venueLabel === "string" && ctx.venueLabel.trim().length > 0,
      severity: "suggest",
      msgKo: "전시 장소(또는 호스트)가 적혀 있지 않아요.",
      msgEn: "Venue or host label is empty.",
    },
    {
      id: "curator",
      code: "missing_curator_or_host",
      pass:
        (typeof ctx.curatorLabel === "string" && ctx.curatorLabel.trim().length > 0) ||
        (typeof ctx.hostLabel === "string" && ctx.hostLabel.trim().length > 0),
      severity: "suggest",
      msgKo: "큐레이터 또는 주최자 정보가 없어요.",
      msgEn: "No curator or host attached.",
    },
    {
      id: "cover",
      code: "missing_cover",
      pass: ctx.hasCover === true,
      severity: "suggest",
      msgKo: "대표 이미지(커버)가 비어 있어요. 전시 카드에 가장 먼저 보이는 이미지예요.",
      msgEn: "No cover image — this is the first thing visitors see on the card.",
    },
    {
      id: "works",
      code: "no_linked_works",
      pass: (ctx.workCount ?? 0) > 0,
      severity: "warn",
      msgKo: "참여 작품이 아직 연결되어 있지 않아요.",
      msgEn: "No participating works linked yet.",
    },
    {
      id: "few_works",
      code: "few_works",
      pass: (ctx.workCount ?? 0) === 0 || (ctx.workCount ?? 0) >= 3,
      severity: "info",
      msgKo: "참여 작품이 1–2점이에요. 가능하다면 더 추가해 보세요.",
      msgEn: "Only 1–2 works linked — add more if you can.",
    },
  ];

  for (const c of checks) {
    if (!c.pass) {
      issues.push({
        id: c.id,
        severity: c.severity,
        code: c.code,
        message: isKo ? c.msgKo : c.msgEn,
      });
    }
  }

  const total = checks.length;
  const passed = checks.filter((c) => c.pass).length;
  const readiness = Math.round((passed / total) * 100);

  return { readiness, issues };
}

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
        fallback: () => buildExhibitionReviewFallback(ctx),
      };
    },
  });
}
