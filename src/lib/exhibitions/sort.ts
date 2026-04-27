/**
 * Exhibition sort modes shared between the public profile (`/u/{username}`)
 * and My Studio (`/my`). Keep both surfaces aligned so visitors and the
 * owner see consistent ordering. Manual order is the single source of truth
 * once the owner saves a custom arrangement on the public preview.
 */

import type { ExhibitionWithCredits } from "@/lib/supabase/exhibitions";

export type ExhibitionSortMode =
  | "manual"
  | "registered_desc"
  | "start_date_desc"
  | "start_date_asc";

export const EXHIBITION_SORT_MODES: ExhibitionSortMode[] = [
  "manual",
  "registered_desc",
  "start_date_desc",
  "start_date_asc",
];

/** i18n key for each sort mode label (defined in messages.ts). */
export const EXHIBITION_SORT_LABEL_KEYS: Record<ExhibitionSortMode, string> = {
  manual: "exhibition.sort.manual",
  registered_desc: "exhibition.sort.registeredDesc",
  start_date_desc: "exhibition.sort.startDateDesc",
  start_date_asc: "exhibition.sort.startDateAsc",
};

const FAR_FUTURE = Number.POSITIVE_INFINITY;
const FAR_PAST = Number.NEGATIVE_INFINITY;

function startTs(row: ExhibitionWithCredits): number | null {
  if (!row.start_date) return null;
  const t = new Date(row.start_date).getTime();
  return Number.isFinite(t) ? t : null;
}

function createdTs(row: ExhibitionWithCredits): number {
  return new Date(row.created_at ?? 0).getTime();
}

/**
 * Sort exhibitions for display. `manualOrderMap` is required only for
 * `manual` mode; rows missing from the map fall back to created_at desc so
 * newly added exhibitions still appear without forcing a re-save.
 */
export function sortExhibitions(
  rows: ExhibitionWithCredits[],
  mode: ExhibitionSortMode,
  manualOrderMap?: Map<string, number>
): ExhibitionWithCredits[] {
  const list = [...rows];
  switch (mode) {
    case "manual": {
      const map = manualOrderMap ?? new Map<string, number>();
      list.sort((a, b) => {
        const ao = map.get(a.id);
        const bo = map.get(b.id);
        if (ao !== undefined && bo !== undefined) return ao - bo;
        if (ao !== undefined) return -1;
        if (bo !== undefined) return 1;
        return createdTs(b) - createdTs(a);
      });
      return list;
    }
    case "start_date_desc": {
      list.sort((a, b) => {
        const at = startTs(a);
        const bt = startTs(b);
        const av = at ?? FAR_PAST;
        const bv = bt ?? FAR_PAST;
        if (av !== bv) return bv - av;
        return createdTs(b) - createdTs(a);
      });
      return list;
    }
    case "start_date_asc": {
      list.sort((a, b) => {
        const at = startTs(a);
        const bt = startTs(b);
        const av = at ?? FAR_FUTURE;
        const bv = bt ?? FAR_FUTURE;
        if (av !== bv) return av - bv;
        return createdTs(a) - createdTs(b);
      });
      return list;
    }
    case "registered_desc":
    default: {
      list.sort((a, b) => createdTs(b) - createdTs(a));
      return list;
    }
  }
}

/**
 * Determine the default sort mode for a given profile context. If the
 * profile has saved a manual order (map is non-empty), honor that as the
 * default; otherwise fall back to `registered_desc`.
 */
export function defaultExhibitionSortMode(
  manualOrderMap?: Map<string, number>
): ExhibitionSortMode {
  if (manualOrderMap && manualOrderMap.size > 0) return "manual";
  return "registered_desc";
}
