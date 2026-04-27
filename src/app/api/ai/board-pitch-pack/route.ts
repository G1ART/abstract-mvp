import { NextResponse } from "next/server";
import { handleAiRoute } from "@/lib/ai/route";
import {
  buildBoardPitchPackContext,
  type BoardPitchPackInput,
} from "@/lib/ai/contexts";
import {
  BOARD_PITCH_PACK_SCHEMA,
  BOARD_PITCH_PACK_SYSTEM,
} from "@/lib/ai/prompts";
import type { BoardPitchPackResult } from "@/lib/ai/types";
import {
  parseBoardPitchPackBody,
  type BoardPitchPackBody,
} from "@/lib/ai/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * P1-A — Board Pitch Pack route.
 *
 * Authorisation: relies on `shortlists` RLS — the user's own boards or
 * boards they are listed as a collaborator on are readable; everything
 * else returns zero rows from the SELECT and we 404. We never query
 * with the service role here so an attacker cannot pivot to another
 * curator's board by guessing the id.
 */
export async function POST(req: Request) {
  return handleAiRoute<BoardPitchPackBody, BoardPitchPackResult>(req, {
    feature: "board_pitch_pack",
    validateBody: (raw) => {
      const r = parseBoardPitchPackBody(raw);
      return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason };
    },
    async buildPromptInput({ body, supabase }) {
      const { data: board, error: boardErr } = await supabase
        .from("shortlists")
        .select("id, title, description")
        .eq("id", body.boardId)
        .single();

      if (boardErr || !board) {
        return NextResponse.json(
          { degraded: true, reason: "invalid_input", validation: "missing_board" },
          { status: 404 },
        );
      }

      const { data: itemsRaw } = await supabase
        .from("shortlist_items")
        .select(
          "id, artwork_id, exhibition_id, note, " +
            "artworks!artwork_id(id, title, year, medium, keywords), " +
            "projects!exhibition_id(id, title, start_date)",
        )
        .eq("shortlist_id", body.boardId)
        .order("position")
        .order("created_at");

      const items = Array.isArray(itemsRaw) ? itemsRaw : [];
      const editorialNotes: string[] = [];
      const artworks: NonNullable<BoardPitchPackInput["artworks"]> = [];
      const exhibitions: NonNullable<BoardPitchPackInput["exhibitions"]> = [];

      for (const row of items as unknown as Array<Record<string, unknown>>) {
        const note = typeof row.note === "string" ? row.note.trim() : "";
        if (note) editorialNotes.push(note.slice(0, 200));
        const aw = row.artworks as
          | {
              id: string;
              title: string | null;
              year: string | number | null;
              medium: string | null;
              keywords: string[] | null;
            }
          | null;
        if (aw && typeof aw === "object" && !Array.isArray(aw)) {
          artworks.push({
            id: aw.id,
            title: aw.title,
            year: aw.year,
            medium: aw.medium,
            themes: Array.isArray(aw.keywords) ? aw.keywords : null,
          });
        }
        const ex = row.projects as
          | { id: string; title: string | null; start_date: string | null }
          | null;
        if (ex && typeof ex === "object" && !Array.isArray(ex)) {
          const yearStr = typeof ex.start_date === "string" ? ex.start_date.slice(0, 4) : null;
          exhibitions.push({
            id: ex.id,
            title: ex.title,
            year: yearStr,
            venue: null,
          });
        }
      }

      const ctx: BoardPitchPackInput = {
        locale: body.locale,
        boardTitle: (board as { title?: string | null }).title ?? null,
        boardDescription: (board as { description?: string | null }).description ?? null,
        editorialNote: editorialNotes.length > 0 ? editorialNotes.join(" / ") : null,
        artworks,
        exhibitions,
      };

      return {
        system: BOARD_PITCH_PACK_SYSTEM,
        user: buildBoardPitchPackContext(ctx),
        schemaHint: BOARD_PITCH_PACK_SCHEMA,
        fallback: () => ({
          summary: "",
          throughline: "",
          missingInfo: [],
          drafts: [],
        }),
      };
    },
  });
}
