"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { createExhibition } from "@/lib/supabase/exhibitions";
import { formatSupabaseError, logSupabaseError } from "@/lib/supabase/errors";

const STATUS_OPTIONS = [
  { value: "planned", labelKey: "exhibition.statusPlanned" },
  { value: "live", labelKey: "exhibition.statusLive" },
  { value: "ended", labelKey: "exhibition.statusEnded" },
] as const;

export default function NewExhibitionPage() {
  const router = useRouter();
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<"planned" | "live" | "ended">("planned");
  const [hostName, setHostName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    const { data, error: err } = await createExhibition({
      title: title.trim(),
      start_date: startDate || null,
      end_date: endDate || null,
      status,
      host_name: hostName.trim() || null,
    });
    setSubmitting(false);
    if (err) {
      logSupabaseError("createExhibition", err);
      setError(formatSupabaseError(err, "Failed to create exhibition"));
      return;
    }
    if (data?.id) router.push(`/my/exhibitions/${data.id}`);
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <Link href="/my/exhibitions" className="text-sm text-zinc-600 hover:text-zinc-900">
            ← {t("common.backTo")} {t("exhibition.myExhibitions")}
          </Link>
        </div>

        <h1 className="mb-6 text-xl font-semibold text-zinc-900">
          {t("exhibition.create")}
        </h1>

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
              {submitting ? "..." : t("exhibition.create")}
            </button>
            <Link
              href="/my/exhibitions"
              className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {t("common.cancel")}
            </Link>
          </div>
        </form>
      </main>
    </AuthGate>
  );
}
