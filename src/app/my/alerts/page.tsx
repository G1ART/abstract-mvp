"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import {
  getAlertPreferences,
  upsertAlertPreferences,
  listSavedInterests,
  addSavedInterest,
  removeSavedInterest,
  listPendingDigestEvents,
  type AlertPreferences,
  type DigestEventRow,
  type DigestFrequency,
  type SavedInterest,
} from "@/lib/supabase/alerts";

function AlertsContent() {
  const { t } = useT();
  const [prefs, setPrefs] = useState<AlertPreferences | null>(null);
  const [interests, setInterests] = useState<SavedInterest[]>([]);
  const [digestEvents, setDigestEvents] = useState<DigestEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newType, setNewType] = useState<SavedInterest["interest_type"]>("artist");
  const [newValue, setNewValue] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: i }, { data: d }] = await Promise.all([
      getAlertPreferences(),
      listSavedInterests(),
      listPendingDigestEvents(20),
    ]);
    setPrefs(p);
    setInterests(i);
    setDigestEvents(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = requestAnimationFrame(() => { void refresh(); });
    return () => cancelAnimationFrame(t);
  }, [refresh]);

  const handleToggleAlerts = useCallback(async () => {
    setSaving(true);
    await upsertAlertPreferences({ new_work_alerts: !(prefs?.new_work_alerts ?? true) });
    await refresh();
    setSaving(false);
  }, [prefs, refresh]);

  const handleDigest = useCallback(async (freq: DigestFrequency) => {
    setSaving(true);
    await upsertAlertPreferences({ digest_frequency: freq });
    await refresh();
    setSaving(false);
  }, [refresh]);

  const handleAddInterest = useCallback(async () => {
    if (!newValue.trim()) return;
    await addSavedInterest(newType, newValue);
    setNewValue("");
    void refresh();
  }, [newType, newValue, refresh]);

  const handleRemoveInterest = useCallback(async (id: string) => {
    await removeSavedInterest(id);
    setInterests((prev) => prev.filter((i) => i.id !== id));
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/my" className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900">
        ← {t("common.backTo")} {t("nav.myProfile")}
      </Link>
      <h1 className="mb-6 text-xl font-semibold text-zinc-900">Alerts</h1>

      {loading ? (
        <p className="text-zinc-500">{t("common.loading")}</p>
      ) : (
        <div className="space-y-8">
          {/* New work alerts */}
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="mb-2 font-medium text-zinc-800">New work notifications</h2>
            <p className="mb-3 text-sm text-zinc-600">Get notified when followed artists upload new works.</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs?.new_work_alerts ?? true}
                onChange={() => void handleToggleAlerts()}
                disabled={saving}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Enable new work alerts
            </label>
          </section>

          {/* Digest preference */}
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="mb-2 font-medium text-zinc-800">Digest</h2>
            <p className="mb-3 text-sm text-zinc-500">Choose how often you want a summary. Email delivery coming soon.</p>
            <div className="flex gap-3">
              {(["off", "daily", "weekly"] as const).map((freq) => (
                <button
                  key={freq}
                  type="button"
                  disabled={saving}
                  onClick={() => void handleDigest(freq)}
                  className={`rounded border px-3 py-1.5 text-sm ${
                    (prefs?.digest_frequency ?? "off") === freq
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                  } disabled:opacity-50`}
                >
                  {freq === "off" ? "Off" : freq.charAt(0).toUpperCase() + freq.slice(1)}
                </button>
              ))}
            </div>
          </section>

          {/* Saved interests */}
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="mb-2 font-medium text-zinc-800">Saved interests</h2>
            <p className="mb-3 text-sm text-zinc-600">Track specific artists, mediums, price bands, or exhibitions.</p>

            <div className="mb-4 flex gap-2">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as SavedInterest["interest_type"])}
                className="rounded border border-zinc-300 px-3 py-2 text-sm"
              >
                <option value="artist">Artist</option>
                <option value="medium">Medium</option>
                <option value="price_band">Price Band</option>
                <option value="exhibition">Exhibition</option>
              </select>
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="e.g. Oil on canvas"
                className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={!newValue.trim()}
                onClick={() => void handleAddInterest()}
                className="rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                Add
              </button>
            </div>

            {interests.length === 0 ? (
              <p className="text-sm text-zinc-500">No saved interests yet.</p>
            ) : (
              <ul className="space-y-2">
                {interests.map((i) => (
                  <li key={i.id} className="flex items-center justify-between rounded bg-zinc-50 px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium text-zinc-600">{i.interest_type}:</span>{" "}
                      <span className="text-zinc-800">{i.interest_value}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRemoveInterest(i.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Queued activity (subtle) */}
          {digestEvents.length > 0 && (
            <details className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
              <summary className="cursor-pointer text-sm text-zinc-500">
                {digestEvents.length} queued event{digestEvents.length !== 1 ? "s" : ""}
              </summary>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {digestEvents.map((ev) => (
                  <li key={ev.id} className="flex items-center justify-between rounded bg-white px-3 py-1.5 text-sm">
                    <span className="text-zinc-600">{ev.event_type}</span>
                    <span className="text-xs text-zinc-400">{new Date(ev.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </main>
  );
}

export default function AlertsPage() {
  return (
    <AuthGate>
      <AlertsContent />
    </AuthGate>
  );
}
