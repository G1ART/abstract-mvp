"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { listMyExhibitions, type ExhibitionRow } from "@/lib/supabase/exhibitions";

export default function MyExhibitionsPage() {
  const { t } = useT();
  const [list, setList] = useState<ExhibitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await listMyExhibitions();
    setLoading(false);
    if (err) {
      setError(err instanceof Error ? err.message : "Failed to load exhibitions");
      return;
    }
    setList(data ?? []);
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return (
    <AuthGate>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/my" className="text-sm text-zinc-600 hover:text-zinc-900">
            ← {t("common.backTo")} {t("nav.myProfile")}
          </Link>
          <Link
            href="/my/exhibitions/new"
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {t("exhibition.create")}
          </Link>
        </div>

        <h1 className="mb-6 text-xl font-semibold text-zinc-900">
          {t("exhibition.myExhibitions")}
        </h1>

        {error && (
          <p className="mb-4 text-sm text-red-600">{error}</p>
        )}

        {loading ? (
          <p className="text-sm text-zinc-500">{t("common.loading")}</p>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 py-12 text-center">
            <p className="mb-4 text-zinc-600">{t("exhibition.emptyList")}</p>
            <Link
              href="/my/exhibitions/new"
              className="inline-block rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              {t("exhibition.create")}
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((ex) => (
              <li key={ex.id}>
                <Link
                  href={`/my/exhibitions/${ex.id}`}
                  className="block rounded-lg border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
                >
                  <p className="font-medium text-zinc-900">{ex.title}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {ex.start_date && ex.end_date
                      ? `${ex.start_date} – ${ex.end_date}`
                      : ex.start_date
                        ? ex.start_date
                        : ex.status}
                    {ex.host_name && ` · ${ex.host_name}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AuthGate>
  );
}
