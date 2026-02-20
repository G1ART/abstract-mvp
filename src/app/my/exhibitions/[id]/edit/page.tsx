"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { getExhibitionById, updateExhibition, type ExhibitionRow } from "@/lib/supabase/exhibitions";
import { formatSupabaseError, logSupabaseError } from "@/lib/supabase/errors";

const STATUS_OPTIONS = [
  { value: "planned", labelKey: "exhibition.statusPlanned" },
  { value: "live", labelKey: "exhibition.statusLive" },
  { value: "ended", labelKey: "exhibition.statusEnded" },
] as const;

export default function EditExhibitionPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useT();
  const id = typeof params.id === "string" ? params.id : "";
  const [exhibition, setExhibition] = useState<ExhibitionRow | null>(null);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<"planned" | "live" | "ended">("planned");
  const [hostName, setHostName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getExhibitionById(id).then(({ data, error: err }) => {
      setLoading(false);
      if (err || !data) {
        setError(err ? (err instanceof Error ? err.message : "Not found") : "Not found");
        return;
      }
      setExhibition(data);
      setTitle(data.title);
      setStartDate(data.start_date ?? "");
      setEndDate(data.end_date ?? "");
      setStatus((data.status as "planned" | "live" | "ended") || "planned");
      setHostName(data.host_name ?? "");
    });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await updateExhibition(id, {
      title: title.trim(),
      start_date: startDate || null,
      end_date: endDate || null,
      status,
      host_name: hostName.trim() || null,
    });
    setSubmitting(false);
    if (err) {
      logSupabaseError("updateExhibition", err);
      setError(formatSupabaseError(err, "Failed to update"));
      return;
    }
    router.push(`/my/exhibitions/${id}`);
  }

  if (!id) {
    return (
      <AuthGate>
        <main className="mx-auto max-w-2xl px-4 py-8">
          <p className="text-zinc-600">Invalid exhibition.</p>
        </main>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <Link href={`/my/exhibitions/${id}`} className="text-sm text-zinc-600 hover:text-zinc-900">
            ← {t("common.backTo")} {t("exhibition.myExhibitions")}
          </Link>
        </div>

        <h1 className="mb-6 text-xl font-semibold text-zinc-900">
          {t("common.edit")} {t("exhibition.myExhibitions")}
        </h1>

        {loading ? (
          <p className="text-sm text-zinc-500">{t("common.loading")}</p>
        ) : !exhibition ? (
          <p className="text-zinc-600">{error ?? "Not found."}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-600">{error}</p>}

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                {t("exhibition.title")} *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("exhibition.titlePlaceholder")}
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  {t("exhibition.startDate")}
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  {t("exhibition.endDate")}
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                {t("exhibition.status")}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "planned" | "live" | "ended")}
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                {t("exhibition.hostName")}
              </label>
              <input
                type="text"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {submitting ? "..." : t("common.save")}
              </button>
              <Link
                href={`/my/exhibitions/${id}`}
                className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {t("common.cancel")}
              </Link>
            </div>
          </form>
        )}
      </main>
    </AuthGate>
  );
}
