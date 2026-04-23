"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/useT";

export type OperationTileKey =
  | "exhibitions"
  | "workshop"
  | "boards"
  | "messages"
  | "inbox"
  | "operations"
  | "network"
  | "views";

export type OperationTile = {
  key: OperationTileKey;
  labelKey: string;
  descKey: string;
  href: string;
  value: string | number | null;
  /** Urgency indicator shown as a small red pill under the value. */
  badge?: string | null;
  /** Visually marks the tile as "locked/upsell" without removing the link. */
  locked?: boolean;
  /** Overrides the default numeric tone (used e.g. for em-dash when locked). */
  valueLabel?: string | null;
  /** data-tour anchor for the upcoming guided-tour patch. */
  dataTour?: string;
};

type Props = {
  tiles: OperationTile[];
};

/**
 * Studio Operation Grid — Brief 2026-04-23 §3 Section 2.
 *
 * A deliberate 2×4 grid of grouped actions that replaces the old stat row
 * + passive section nav split. Every tile is a destination:
 *   • label
 *   • one short subtitle
 *   • one summary value (count or em-dash)
 *   • optional urgency badge
 *
 * The visual language is unified across tiles so the user reads the grid
 * as one cockpit, not eight unrelated cards.
 */
export function StudioOperationGrid({ tiles }: Props) {
  const { t } = useT();
  if (tiles.length === 0) return null;
  return (
    <section
      data-tour="studio-operating-grid"
      aria-label={t("studio.operationGrid.title")}
      className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-2 md:grid-cols-4"
    >
      {tiles.map((tile) => {
        const displayValue =
          tile.valueLabel ??
          (tile.value == null ? "—" : String(tile.value));
        return (
          <Link
            key={tile.key}
            href={tile.href}
            data-tour={tile.dataTour}
            className={`group flex flex-col justify-between gap-2 rounded-xl border p-4 transition-all ${
              tile.locked
                ? "border-dashed border-zinc-300 bg-zinc-50 hover:border-zinc-400"
                : "border-zinc-200 bg-white hover:border-zinc-400 hover:shadow-sm"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-900 group-hover:text-zinc-700">
                {t(tile.labelKey)}
              </p>
              <p
                className={`shrink-0 text-base font-semibold tabular-nums ${
                  tile.locked ? "text-zinc-400" : "text-zinc-900"
                }`}
              >
                {displayValue}
              </p>
            </div>
            <p className="line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
              {t(tile.descKey)}
            </p>
            {tile.badge && (
              <p className="self-start rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white">
                {tile.badge}
              </p>
            )}
          </Link>
        );
      })}
    </section>
  );
}
