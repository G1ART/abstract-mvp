"use client";

import { useT } from "@/lib/i18n/useT";
import {
  EXHIBITION_SORT_LABEL_KEYS,
  type ExhibitionSortMode,
} from "@/lib/exhibitions/sort";

type Props = {
  value: ExhibitionSortMode;
  onChange: (next: ExhibitionSortMode) => void;
  /** Hide the "Custom order" option when no manual order has been saved yet. */
  showManual?: boolean;
  className?: string;
};

/**
 * Compact sort dropdown shared by the public profile and My Studio
 * exhibitions tab. Behaves like a plain native `<select>` — no popover
 * library — so it stays accessible and predictable on mobile.
 */
export function ExhibitionSortDropdown({
  value,
  onChange,
  showManual = false,
  className,
}: Props) {
  const { t } = useT();

  const options: ExhibitionSortMode[] = [
    "registered_desc",
    "start_date_desc",
    "start_date_asc",
  ];
  if (showManual) options.unshift("manual");

  return (
    <label className={`inline-flex items-center gap-1.5 text-xs text-zinc-600 ${className ?? ""}`}>
      <span className="hidden sm:inline">{t("exhibition.sort.label")}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ExhibitionSortMode)}
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700"
        aria-label={t("exhibition.sort.label")}
      >
        {options.map((mode) => (
          <option key={mode} value={mode}>
            {t(EXHIBITION_SORT_LABEL_KEYS[mode])}
          </option>
        ))}
      </select>
    </label>
  );
}
