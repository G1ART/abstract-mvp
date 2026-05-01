"use client";

import { useT } from "@/lib/i18n/useT";

export type StudioSignal = {
  key: string;
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "locked";
  hint?: string | null;
};

type Props = {
  signals: StudioSignal[];
  emptyHint?: string | null;
};

/**
 * Studio Signals (Track 3.2 / 4.4)
 *
 * Quick-glance numbers for the last 7 days: profile views, follower delta,
 * unread inquiries, pending claims. Entitlement-locked signals carry the
 * upsell copy instead of the real value.
 */
export function StudioSignals({ signals, emptyHint }: Props) {
  const { t } = useT();
  if (!signals.length) {
    return (
      <section className="mb-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/70 p-4 text-sm text-zinc-500">
        {emptyHint ?? t("studio.empty.network")}
      </section>
    );
  }
  return (
    <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {signals.map((s) => (
        <div
          key={s.key}
          className={`rounded-xl border p-3 ${
            s.tone === "warning"
              ? "border-amber-300 bg-amber-50"
              : s.tone === "locked"
                ? "border-dashed border-zinc-300 bg-zinc-50"
                : "border-zinc-200 bg-white"
          }`}
        >
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">{s.label}</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{s.value}</p>
          {s.hint && <p className="mt-0.5 text-[11px] text-zinc-500">{s.hint}</p>}
        </div>
      ))}
    </section>
  );
}
