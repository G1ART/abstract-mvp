"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { supabase } from "@/lib/supabase/client";
import { SectionFrame } from "@/components/ds/SectionFrame";
import { SectionTitle } from "@/components/ds/SectionTitle";

/**
 * AI Wave 2 — gated metrics surface.
 *
 * Visible only when NEXT_PUBLIC_AI_METRICS=1 (or in development). The view
 * reads the `v_ai_events_summary` rollup which is owner-scoped by RLS on
 * the underlying `ai_events` table, so contributors see only their own
 * generation counters. No admin-wide snapshot is exposed from the client.
 */
const SHOW =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_AI_METRICS === "1";

type Row = {
  feature_key: string;
  events_total: number;
  events_degraded: number;
  events_accepted: number;
  events_7d: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  last_event_at: string | null;
};

type UsageRow = {
  event_key: string;
  feature_key: string | null;
  total: number;
  last_30d: number;
  last_at: string | null;
};

export default function AiMetricsPage() {
  const { t } = useT();
  const [rows, setRows] = useState<Row[]>([]);
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!SHOW) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("v_ai_events_summary")
      .select(
        "feature_key, events_total, events_degraded, events_accepted, events_7d, avg_latency_ms, p95_latency_ms, last_event_at",
      )
      .order("events_total", { ascending: false })
      .limit(50);
    if (err) setError(err.message);
    setRows((data ?? []) as Row[]);

    // Compute usage aggregates client-side over the caller's own rows (RLS
    // restricts `usage_events` to the authenticated user).
    const { data: usageData, error: usageErr } = await supabase
      .from("usage_events")
      .select("event_key, feature_key, value_int, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (usageErr && !err) setError(usageErr.message);
    if (usageData) {
      const now = Date.now();
      const windowStart = now - 30 * 24 * 60 * 60 * 1000;
      const map = new Map<string, UsageRow>();
      for (const r of usageData as Array<{
        event_key: string;
        feature_key: string | null;
        value_int: number | null;
        created_at: string;
      }>) {
        const key = `${r.event_key}::${r.feature_key ?? ""}`;
        const value = Number(r.value_int ?? 1);
        const isRecent = new Date(r.created_at).getTime() >= windowStart;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            event_key: r.event_key,
            feature_key: r.feature_key,
            total: value,
            last_30d: isRecent ? value : 0,
            last_at: r.created_at,
          });
        } else {
          existing.total += value;
          if (isRecent) existing.last_30d += value;
          if (!existing.last_at || existing.last_at < r.created_at) {
            existing.last_at = r.created_at;
          }
        }
      }
      const sorted = Array.from(map.values()).sort((a, b) => b.total - a.total);
      setUsageRows(sorted);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void refresh();
    });
    return () => cancelAnimationFrame(id);
  }, [refresh]);

  const totals = useMemo(() => {
    let total = 0;
    let degraded = 0;
    let accepted = 0;
    for (const r of rows) {
      total += r.events_total;
      degraded += r.events_degraded;
      accepted += r.events_accepted;
    }
    return { total, degraded, accepted };
  }, [rows]);

  if (!SHOW) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-zinc-600">
          {t("ai.metrics.disabled")}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          {t("ai.metrics.disabledHint")}
        </p>
      </main>
    );
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900">
            {t("ai.metrics.title")}
          </h1>
          <Link href="/my" className="text-xs text-zinc-500 hover:underline">
            {t("ai.metrics.backToStudio")}
          </Link>
        </div>

        <p className="mb-4 text-xs text-zinc-500">{t("ai.metrics.scopeHint")}</p>

        <SectionFrame padding="md" noMargin>
          <SectionTitle eyebrow={t("ai.metrics.totals")}>
            {t("ai.metrics.totalsSubtitle")}
          </SectionTitle>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Stat label={t("ai.metrics.totalsAll")} value={totals.total} />
            <Stat
              label={t("ai.metrics.totalsAccepted")}
              value={totals.accepted}
              hint={
                totals.total > 0
                  ? `${Math.round((totals.accepted / totals.total) * 100)}%`
                  : "—"
              }
            />
            <Stat
              label={t("ai.metrics.totalsDegraded")}
              value={totals.degraded}
              hint={
                totals.total > 0
                  ? `${Math.round((totals.degraded / totals.total) * 100)}%`
                  : "—"
              }
            />
          </div>
        </SectionFrame>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500 disabled:opacity-60"
          >
            {loading ? t("ai.state.loading") : t("ai.metrics.refresh")}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-xs text-amber-700">
            {t("ai.error.tryLater")} · {error}
          </p>
        )}

        <SectionFrame padding="md">
          <SectionTitle eyebrow={t("ai.metrics.byFeature")}>
            {t("ai.metrics.byFeatureSubtitle")}
          </SectionTitle>
          {rows.length === 0 ? (
            <p className="text-xs text-zinc-500">{t("ai.metrics.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500">
                    <th className="py-2 pr-3">{t("ai.metrics.col.feature")}</th>
                    <th className="py-2 pr-3">{t("ai.metrics.col.total")}</th>
                    <th className="py-2 pr-3">{t("ai.metrics.col.accepted")}</th>
                    <th className="py-2 pr-3">{t("ai.metrics.col.degraded")}</th>
                    <th className="py-2 pr-3">{t("ai.metrics.col.last7d")}</th>
                    <th className="py-2 pr-3">{t("ai.metrics.col.avgMs")}</th>
                    <th className="py-2 pr-3">{t("ai.metrics.col.p95Ms")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-800">
                  {rows.map((r) => (
                    <tr key={r.feature_key}>
                      <td className="py-2 pr-3 font-medium">{r.feature_key}</td>
                      <td className="py-2 pr-3">{r.events_total}</td>
                      <td className="py-2 pr-3">{r.events_accepted}</td>
                      <td className="py-2 pr-3">{r.events_degraded}</td>
                      <td className="py-2 pr-3">{r.events_7d}</td>
                      <td className="py-2 pr-3">
                        {r.avg_latency_ms != null ? Math.round(r.avg_latency_ms) : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {r.p95_latency_ms != null ? Math.round(r.p95_latency_ms) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionFrame>

        <SectionFrame padding="md">
          <SectionTitle eyebrow="usage_events">
            Monetization meter (self)
          </SectionTitle>
          {usageRows.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No usage events recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500">
                    <th className="py-2 pr-3">event_key</th>
                    <th className="py-2 pr-3">feature_key</th>
                    <th className="py-2 pr-3">total</th>
                    <th className="py-2 pr-3">last_30d</th>
                    <th className="py-2 pr-3">last_at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-800">
                  {usageRows.slice(0, 80).map((r) => (
                    <tr key={`${r.event_key}::${r.feature_key ?? ""}`}>
                      <td className="py-2 pr-3 font-medium">{r.event_key}</td>
                      <td className="py-2 pr-3 text-zinc-600">
                        {r.feature_key ?? "—"}
                      </td>
                      <td className="py-2 pr-3">{r.total}</td>
                      <td className="py-2 pr-3">{r.last_30d}</td>
                      <td className="py-2 pr-3">
                        {r.last_at
                          ? new Date(r.last_at).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionFrame>
      </main>
    </AuthGate>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}
