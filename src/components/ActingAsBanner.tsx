"use client";

import { useActingAs } from "@/context/ActingAsContext";
import { useT } from "@/lib/i18n/useT";

/**
 * Acting-as banner (Track 5.3)
 *
 * When a delegate has chosen to act on behalf of another profile (via
 * ActingAsContext), we show a persistent strip at the top of the screen
 * so every mutation makes its attribution explicit. Revoke is one tap.
 */
export function ActingAsBanner() {
  const { actingAsProfileId, actingAsLabel, clearActingAs } = useActingAs();
  const { t } = useT();
  if (!actingAsProfileId) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 w-full border-b border-amber-300 bg-amber-50"
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2 text-xs text-amber-900">
        <span>
          {t("actingAs.banner")}{" "}
          <strong className="font-semibold">{actingAsLabel ?? actingAsProfileId}</strong>
        </span>
        <button
          type="button"
          onClick={clearActingAs}
          className="rounded-full border border-amber-400 bg-white px-3 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
        >
          {t("actingAs.exit")}
        </button>
      </div>
    </div>
  );
}
