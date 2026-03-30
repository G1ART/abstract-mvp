"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { readFeedPerf } from "@/lib/feed/feedPerf";
import { supabase } from "@/lib/supabase/client";

const SHOW =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DIAGNOSTICS === "1";

export default function DiagnosticsPage() {
  const { t } = useT();
  const [rows, setRows] = useState<{ event_name: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!SHOW) return;
    setLoading(true);
    const { data } = await supabase
      .from("beta_analytics_events")
      .select("event_name, created_at")
      .order("created_at", { ascending: false })
      .limit(80);
    setRows((data ?? []) as { event_name: string; created_at: string }[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      void refresh();
    });
    return () => cancelAnimationFrame(t);
  }, [refresh]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      m.set(r.event_name, (m.get(r.event_name) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  if (!SHOW) {
    return (
      <AuthGate>
        <main className="mx-auto max-w-lg px-4 py-12">
          <p className="text-zinc-600">{t("diagnostics.denied")}</p>
          <Link href="/my" className="mt-4 inline-block text-sm text-zinc-500 hover:text-zinc-800">
            ← /my
          </Link>
        </main>
      </AuthGate>
    );
  }

  const buildStamp =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_BUILD_ID ||
    "local";

  return (
    <AuthGate>
      <main className="mx-auto max-w-lg px-4 py-8">
        <Link href="/my" className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900">
          ← /my
        </Link>
        <h1 className="mb-4 text-xl font-semibold text-zinc-900">{t("diagnostics.title")}</h1>
        <p className="mb-6 text-sm text-zinc-600">
          {t("diagnostics.build")}: <code className="rounded bg-zinc-100 px-1">{buildStamp}</code>
        </p>
        <p className="mb-2 text-sm font-medium text-zinc-800">{t("diagnostics.feedPerf")}</p>
        <ul className="mb-6 list-inside list-disc text-sm text-zinc-600">
          <li>feed_first_paint: {readFeedPerf("feed_first_paint") ?? "—"}</li>
          <li>feed_data_loaded_ms: {readFeedPerf("feed_data_loaded_ms") ?? "—"}</li>
          <li>feed_fetch_started: {readFeedPerf("feed_fetch_started") ?? "—"}</li>
        </ul>
        <p className="mb-2 text-sm font-medium text-zinc-800">{t("diagnostics.recentEvents")}</p>
        {loading ? (
          <p className="text-sm text-zinc-500">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-zinc-500">—</p>
        ) : (
          <>
            <ul className="mb-4 text-sm text-zinc-700">
              {counts.map(([name, n]) => (
                <li key={name}>
                  {name}: {n}
                </li>
              ))}
            </ul>
            <ul className="max-h-64 overflow-auto text-xs text-zinc-500">
              {rows.slice(0, 40).map((r) => (
                <li key={`${r.event_name}-${r.created_at}`}>
                  {r.event_name} · {new Date(r.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          </>
        )}
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-6 rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
        >
          {t("common.refresh")}
        </button>
        <p className="mt-8 text-xs text-zinc-400">
          Migrations: apply <code className="rounded bg-zinc-100 px-1">p0_beta_hardening_wave1.sql</code> in Supabase
          for events + inquiry thread.
        </p>
      </main>
    </AuthGate>
  );
}
