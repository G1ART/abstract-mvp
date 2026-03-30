"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/useT";

type OpsRow = {
  profile_id: string;
  username: string | null;
  display_name: string | null;
  email: string | null;
  has_random_username: boolean;
  artwork_count: number;
  created_at: string;
  delegation_count: number;
};

function OpsContent() {
  const { t } = useT();
  const [rows, setRows] = useState<OpsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "random_username" | "no_uploads">("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("ops_onboarding_summary");
    if (!error && data) setRows(data as OpsRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = requestAnimationFrame(() => { void refresh(); });
    return () => cancelAnimationFrame(t);
  }, [refresh]);

  const filtered = rows.filter((r) => {
    if (filter === "random_username") return r.has_random_username;
    if (filter === "no_uploads") return r.artwork_count === 0;
    return true;
  });

  const stats = {
    total: rows.length,
    randomUsername: rows.filter((r) => r.has_random_username).length,
    noUploads: rows.filter((r) => r.artwork_count === 0).length,
    withDelegations: rows.filter((r) => r.delegation_count > 0).length,
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/my" className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900">
        ← {t("common.backTo")} {t("nav.myProfile")}
      </Link>
      <h1 className="mb-4 text-xl font-semibold text-zinc-900">Beta Ops Panel</h1>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-center">
          <p className="text-2xl font-bold text-zinc-900">{stats.total}</p>
          <p className="text-xs text-zinc-500">Total profiles</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{stats.randomUsername}</p>
          <p className="text-xs text-zinc-500">Random username</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{stats.noUploads}</p>
          <p className="text-xs text-zinc-500">No uploads</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{stats.withDelegations}</p>
          <p className="text-xs text-zinc-500">With delegations</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="all">All ({stats.total})</option>
          <option value="random_username">Random username ({stats.randomUsername})</option>
          <option value="no_uploads">No uploads ({stats.noUploads})</option>
        </select>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
        >
          {t("common.refresh")}
        </button>
      </div>

      {loading ? (
        <p className="text-zinc-500">{t("common.loading")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs text-zinc-500">
              <tr>
                <th className="pb-2 pr-4">Username</th>
                <th className="pb-2 pr-4">Display name</th>
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4 text-right">Works</th>
                <th className="pb-2 pr-4 text-right">Delegations</th>
                <th className="pb-2 pr-4">Flags</th>
                <th className="pb-2">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((r) => (
                <tr key={r.profile_id} className="hover:bg-zinc-50">
                  <td className="py-2 pr-4">
                    <Link href={`/u/${r.username ?? ""}`} className="font-medium text-zinc-800 hover:underline">
                      {r.username ?? "—"}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-zinc-600">{r.display_name ?? "—"}</td>
                  <td className="py-2 pr-4 text-zinc-500">{r.email ?? "—"}</td>
                  <td className="py-2 pr-4 text-right">{r.artwork_count}</td>
                  <td className="py-2 pr-4 text-right">{r.delegation_count}</td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {r.has_random_username && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">random id</span>
                      )}
                      {r.artwork_count === 0 && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">no uploads</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-xs text-zinc-400">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="mt-4 text-center text-sm text-zinc-500">No profiles match this filter.</p>
          )}
        </div>
      )}
    </main>
  );
}

export default function OpsPage() {
  return (
    <AuthGate>
      <OpsContent />
    </AuthGate>
  );
}
