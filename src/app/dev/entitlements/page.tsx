"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { SectionFrame } from "@/components/ds/SectionFrame";
import { SectionTitle } from "@/components/ds/SectionTitle";
import { supabase } from "@/lib/supabase/client";
import {
  FEATURE_KEYS,
  BETA_ALL_PAID,
  resolveEntitlementFor,
  type EntitlementDecision,
  type FeatureKey,
} from "@/lib/entitlements";
import { useActingAs } from "@/context/ActingAsContext";

/**
 * `/dev/entitlements` — client-side diagnostic surface for the
 * monetization spine. Visible only in development or when
 * `NEXT_PUBLIC_ENTITLEMENTS_DIAG=1`. It walks every canonical
 * `FeatureKey`, runs it through `resolveEntitlementFor`, and shows the
 * resolved plan, source, uiState, quota, and paywallHint.
 *
 * Because `BETA_ALL_PAID` is currently true, most rows should resolve
 * with `source=beta_override` / `uiState=beta_granted` — the point of
 * this page is to make the *shadow* decision obvious so we can flip the
 * flag with confidence when monetization turns on.
 */
const SHOW =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_ENTITLEMENTS_DIAG === "1";

type Row = {
  featureKey: FeatureKey;
  decision: EntitlementDecision | null;
};

export default function EntitlementsDiagPage() {
  const { actingAsProfileId, actingAsLabel } = useActingAs();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!SHOW) return;
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id ?? null;
    setUserId(uid);

    const out: Row[] = [];
    for (const key of FEATURE_KEYS) {
      const decision = await resolveEntitlementFor({
        featureKey: key,
        userId: uid,
        actingAsOwnerUserId: actingAsProfileId ?? null,
        skipQuotaCheck: false,
      }).catch(() => null);
      out.push({ featureKey: key, decision });
    }
    setRows(out);
    setLoading(false);
  }, [actingAsProfileId]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void refresh();
    });
    return () => cancelAnimationFrame(id);
  }, [refresh]);

  if (!SHOW) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-zinc-600">
          Entitlements diagnostics are disabled in this environment.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Set <code>NEXT_PUBLIC_ENTITLEMENTS_DIAG=1</code> to enable.
        </p>
      </main>
    );
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900">
            Entitlements diagnostics
          </h1>
          <Link href="/my" className="text-xs text-zinc-500 hover:underline">
            Back to studio
          </Link>
        </div>

        <SectionFrame padding="md" noMargin>
          <SectionTitle eyebrow="Context">Resolver context</SectionTitle>
          <dl className="grid grid-cols-1 gap-2 text-xs text-zinc-700 sm:grid-cols-2">
            <div className="flex justify-between rounded-md border border-zinc-200 bg-white px-3 py-2">
              <dt className="text-zinc-500">user_id</dt>
              <dd className="font-mono">{userId ?? "—"}</dd>
            </div>
            <div className="flex justify-between rounded-md border border-zinc-200 bg-white px-3 py-2">
              <dt className="text-zinc-500">acting_as</dt>
              <dd className="font-mono">
                {actingAsProfileId ? `${actingAsLabel ?? ""} (${actingAsProfileId.slice(0, 8)}…)` : "—"}
              </dd>
            </div>
            <div className="flex justify-between rounded-md border border-zinc-200 bg-white px-3 py-2">
              <dt className="text-zinc-500">BETA_ALL_PAID</dt>
              <dd className="font-mono">{String(BETA_ALL_PAID)}</dd>
            </div>
            <div className="flex justify-between rounded-md border border-zinc-200 bg-white px-3 py-2">
              <dt className="text-zinc-500">feature count</dt>
              <dd className="font-mono">{FEATURE_KEYS.length}</dd>
            </div>
          </dl>
        </SectionFrame>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500 disabled:opacity-60"
          >
            {loading ? "Resolving…" : "Refresh"}
          </button>
        </div>

        <SectionFrame padding="md">
          <SectionTitle eyebrow="feature_keys">Decisions</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-3">feature</th>
                  <th className="py-2 pr-3">allowed</th>
                  <th className="py-2 pr-3">source</th>
                  <th className="py-2 pr-3">plan</th>
                  <th className="py-2 pr-3">ui_state</th>
                  <th className="py-2 pr-3">quota</th>
                  <th className="py-2 pr-3">hint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-800">
                {rows.map(({ featureKey, decision }) => {
                  const q = decision?.quota ?? null;
                  return (
                    <tr key={featureKey}>
                      <td className="py-2 pr-3 font-mono">{featureKey}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            decision?.allowed
                              ? "inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
                              : "inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800"
                          }
                        >
                          {decision?.allowed ? "yes" : "no"}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-zinc-600">
                        {decision?.source ?? "—"}
                      </td>
                      <td className="py-2 pr-3">{decision?.planKey ?? "—"}</td>
                      <td className="py-2 pr-3">{decision?.uiState ?? "—"}</td>
                      <td className="py-2 pr-3">
                        {q
                          ? `${q.used}/${
                              q.limit === Number.POSITIVE_INFINITY
                                ? "∞"
                                : q.limit
                            } · ${q.windowDays}d`
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 text-zinc-500">
                        {decision?.paywallHint ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionFrame>
      </main>
    </AuthGate>
  );
}
