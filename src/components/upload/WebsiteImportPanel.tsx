"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { getSession } from "@/lib/supabase/auth";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";
import type { WebsiteImportCandidate, WebsiteImportMatchRow } from "@/lib/websiteImport/types";
import { BULK_MY_DRAFTS_QUERY_LIMIT, UPLOAD_WEBSITE_MATCH_MAX_ARTWORKS } from "@/lib/upload/limits";

type DraftLite = {
  id: string;
  title: string | null;
  artwork_images?: { storage_path: string; sort_order?: number | null }[] | null;
};

type WiSession = {
  id: string;
  status: string;
  scan_error: string | null;
  source_url: string;
  candidates: WebsiteImportCandidate[];
  match_rows: WebsiteImportMatchRow[];
};

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("auth");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

type WiErrPhase = "create" | "scan" | "match" | "pick" | "apply" | "load";

function wiErrorMessage(code: string | undefined, phase: WiErrPhase, t: (key: string) => string): string {
  if (!code) return t("bulk.wi.errGeneric").replace("{code}", "unknown");
  switch (code) {
    case "auth":
      return t("bulk.wi.authRequired");
    case "invalid_url":
      return t("bulk.wi.errInvalidUrl");
    case "invalid_json":
      return t("bulk.wi.errGeneric").replace("{code}", "invalid_json");
    case "insert_failed":
    case "create_failed":
      return t("bulk.wi.errCreateSession");
    case "invalid_stored_url":
      return t("bulk.wi.errScanFailed");
    case "not_found":
      return t("bulk.wi.errLoadSession");
    case "artworkIds_required":
      return t("bulk.wi.errNoDraftsToMatch");
    case "too_many_ids":
      return t("bulk.wi.errMatchFailed");
    case "scan_not_ready":
    case "no_candidates":
      return t("bulk.wi.errScanFailed");
    case "artworks_load_failed":
      return t("bulk.wi.errMatchFailed");
    case "artworkId_required":
    case "candidateId_required":
    case "row_not_found":
    case "candidate_not_found":
      return t("bulk.wi.errPickFailed");
    case "load_session":
      return t("bulk.wi.errLoadSession");
    case "pick_failed":
      return t("bulk.wi.errPickFailed");
    case "apply_failed":
      return t("bulk.wi.errApplyFailed");
    case "scan_failed":
      return t("bulk.wi.errScanFailed");
    case "match_failed":
      return t("bulk.wi.errMatchFailed");
    default:
      break;
  }
  if (phase === "scan") {
    if (/^[a-z0-9_-]+$/i.test(code) && code.length < 48) return t("bulk.wi.errScanFailed");
    return t("bulk.wi.scanFailed").replace("{message}", code);
  }
  if (phase === "match") return t("bulk.wi.errMatchFailed");
  if (phase === "pick") return t("bulk.wi.errPickFailed");
  if (phase === "apply") return t("bulk.wi.errApplyFailed");
  if (phase === "load") return t("bulk.wi.errLoadSession");
  return t("bulk.wi.errGeneric").replace("{code}", code);
}

export function WebsiteImportPanel(props: {
  t: (key: string) => string;
  actingAsProfileId: string | null;
  drafts: DraftLite[];
  stagedArtworkIds: string[];
  onApplied: () => void | Promise<void>;
  onApplyToast?: (appliedCount: number) => void;
  onSessionReset?: () => void;
}) {
  const { t, actingAsProfileId, drafts, stagedArtworkIds, onApplied, onApplyToast, onSessionReset } = props;
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<WiSession | null>(null);
  const [busy, setBusy] = useState<"idle" | "scan" | "match" | "apply" | "pick">("idle");
  const [error, setError] = useState<string | null>(null);
  const [applyIds, setApplyIds] = useState<Record<string, boolean>>({});
  const [lastScanUrl, setLastScanUrl] = useState("");
  const [matchBatch, setMatchBatch] = useState<{ current: number; total: number } | null>(null);

  const refreshSession = useCallback(async (id: string): Promise<WiSession> => {
    const h = await authHeaders();
    const res = await fetch(`/api/import/website/session/${id}`, { headers: h });
    if (!res.ok) throw new Error("load_session");
    const row = (await res.json()) as WiSession;
    setSession(row);
    return row;
  }, []);

  const candidates = session?.candidates ?? [];
  const matchRows = session?.match_rows ?? [];

  const idToDraft = useMemo(() => {
    const m = new Map<string, DraftLite>();
    for (const d of drafts) m.set(d.id, d);
    return m;
  }, [drafts]);

  const statusLabel = useCallback(
    (s: WebsiteImportMatchRow["match_status"]) => {
      if (s === "high_confidence") return t("bulk.wi.statusHigh");
      if (s === "review_needed") return t("bulk.wi.statusReview");
      return t("bulk.wi.statusNone");
    },
    [t],
  );

  async function handleScan() {
    setError(null);
    setBusy("scan");
    try {
      let h: HeadersInit;
      try {
        h = await authHeaders();
      } catch {
        throw new Error("auth");
      }
      let sid = sessionId;
      if (sid && lastScanUrl && url.trim() !== lastScanUrl) {
        setSessionId(null);
        setSession(null);
        sid = null;
      }
      if (!sid) {
        const cr = await fetch("/api/import/website/session", {
          method: "POST",
          headers: h,
          body: JSON.stringify({
            sourceUrl: url.trim(),
            actingProfileId: actingAsProfileId ?? undefined,
          }),
        });
        if (!cr.ok) {
          const j = await cr.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error ?? "create_failed");
        }
        const { id } = (await cr.json()) as { id: string };
        sid = id;
        setSessionId(id);
      }
      const sr = await fetch(`/api/import/website/session/${sid}/scan`, {
        method: "POST",
        headers: h,
      });
      if (!sr.ok) {
        const j = await sr.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "scan_failed");
      }
      await refreshSession(sid);
      setLastScanUrl(url.trim());
    } catch (e) {
      if (e instanceof Error && e.message === "auth") setError(t("bulk.wi.authRequired"));
      else setError(wiErrorMessage(e instanceof Error ? e.message : undefined, "scan", t));
    } finally {
      setBusy("idle");
    }
  }

  async function handleMatch() {
    if (!sessionId) return;
    const rawIds =
      stagedArtworkIds.length > 0
        ? stagedArtworkIds
        : drafts.slice(0, BULK_MY_DRAFTS_QUERY_LIMIT).map((d) => d.id);
    if (rawIds.length === 0) return;
    const chunks: string[][] = [];
    for (let i = 0; i < rawIds.length; i += UPLOAD_WEBSITE_MATCH_MAX_ARTWORKS) {
      chunks.push(rawIds.slice(i, i + UPLOAD_WEBSITE_MATCH_MAX_ARTWORKS));
    }
    setBusy("match");
    setError(null);
    setMatchBatch(null);
    try {
      const h = await authHeaders();
      const nextApply: Record<string, boolean> = { ...applyIds };
      for (let c = 0; c < chunks.length; c++) {
        const ids = chunks[c]!;
        setMatchBatch({ current: c + 1, total: chunks.length });
        const res = await fetch(`/api/import/website/session/${sessionId}/match`, {
          method: "POST",
          headers: h,
          body: JSON.stringify({ artworkIds: ids }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error ?? "match_failed");
        }
        const body = (await res.json()) as { rows?: WebsiteImportMatchRow[] };
        for (const r of body.rows ?? []) {
          nextApply[r.artwork_id] = r.match_status === "high_confidence";
        }
      }
      await refreshSession(sessionId);
      setApplyIds(nextApply);
    } catch (e) {
      if (e instanceof Error && e.message === "auth") setError(t("bulk.wi.authRequired"));
      else setError(wiErrorMessage(e instanceof Error ? e.message : undefined, "match", t));
    } finally {
      setMatchBatch(null);
      setBusy("idle");
    }
  }

  async function handlePick(artworkId: string, candidateId: string | null) {
    if (!sessionId) return;
    setBusy("pick");
    try {
      const h = await authHeaders();
      const res = await fetch(`/api/import/website/session/${sessionId}/pick`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ artworkId, candidateId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "pick_failed");
      }
      await refreshSession(sessionId);
    } catch (e) {
      if (e instanceof Error && e.message === "auth") setError(t("bulk.wi.authRequired"));
      else setError(wiErrorMessage(e instanceof Error ? e.message : undefined, "pick", t));
    } finally {
      setBusy("idle");
    }
  }

  async function handleApplySelected() {
    if (!sessionId) return;
    const items = matchRows
      .filter((r) => applyIds[r.artwork_id])
      .map((r) => ({ artwork_id: r.artwork_id, apply: true }));
    if (items.length === 0) return;
    setBusy("apply");
    setError(null);
    try {
      const h = await authHeaders();
      const res = await fetch(`/api/import/website/session/${sessionId}/apply`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "apply_failed");
      }
      const j = (await res.json()) as { applied?: number };
      await onApplied();
      await refreshSession(sessionId);
      if (typeof j.applied === "number" && j.applied > 0) {
        onApplyToast?.(j.applied);
      }
    } catch (e) {
      if (e instanceof Error && e.message === "auth") setError(t("bulk.wi.authRequired"));
      else setError(wiErrorMessage(e instanceof Error ? e.message : undefined, "apply", t));
    } finally {
      setBusy("idle");
    }
  }

  function clearSession() {
    setSessionId(null);
    setSession(null);
    setUrl("");
    setApplyIds({});
    setError(null);
    setLastScanUrl("");
    onSessionReset?.();
  }

  const scanDone = session?.status === "scan_done" || session?.status === "matched" || session?.status === "applied";
  const matched = session?.status === "matched" || session?.status === "applied";

  return (
    <div className="mb-6 rounded-xl border border-zinc-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1 pr-2 text-left">
          <p className="text-sm font-semibold text-zinc-900">{t("bulk.wi.title")}</p>
          <p className="text-xs text-zinc-500">{t("bulk.wi.subtitle")}</p>
        </div>
        <span className="shrink-0 text-zinc-400 tabular-nums">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-zinc-100 px-4 pb-4 pt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block flex-1 text-xs font-medium text-zinc-600">
              {t("bulk.wi.urlLabel")}
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t("bulk.wi.urlPlaceholder")}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                disabled={busy !== "idle"}
              />
            </label>
            <button
              type="button"
              disabled={busy !== "idle" || !url.trim()}
              onClick={() => void handleScan()}
              className="shrink-0 whitespace-nowrap rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {busy === "scan" ? t("bulk.wi.scanning") : t("bulk.wi.scan")}
            </button>
          </div>
          {session?.status === "failed" && session.scan_error && (
            <p className="text-sm text-red-600">
              {t("bulk.wi.scanFailed").replace("{message}", session.scan_error)}
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {scanDone && candidates.length > 0 && (
            <p className="text-sm text-emerald-800">
              {t("bulk.wi.scanDone").replace("{n}", String(candidates.length))}
            </p>
          )}
          {scanDone && candidates.length > 0 && (
            <div
              className="rounded-lg border border-sky-200/80 bg-sky-50/80 px-3 py-2.5 text-xs leading-relaxed text-sky-950/90"
              role="status"
            >
              {t("bulk.wi.matchLimitCallout")}
            </div>
          )}
          {scanDone && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                disabled={busy !== "idle" || candidates.length === 0}
                onClick={() => void handleMatch()}
                className="inline-flex w-fit shrink-0 whitespace-nowrap rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-50"
              >
                {busy === "match"
                  ? matchBatch && matchBatch.total > 1
                    ? t("bulk.wi.matchingBatch")
                        .replace("{current}", String(matchBatch.current))
                        .replace("{total}", String(matchBatch.total))
                    : t("bulk.wi.matching")
                  : t("bulk.wi.match")}
              </button>
              <p className="text-xs leading-relaxed text-zinc-500 sm:max-w-md">{t("bulk.wi.matchHint")}</p>
            </div>
          )}
          {matched && matchRows.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-zinc-900">{t("bulk.wi.reviewTitle")}</h4>
              <div className="overflow-x-auto rounded-lg border border-zinc-200">
                <table className="min-w-full divide-y divide-zinc-200 text-sm">
                  <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">{t("bulk.wi.yourImage")}</th>
                      <th className="px-3 py-2">{t("bulk.wi.siteImage")}</th>
                      <th className="px-3 py-2">{t("bulk.wi.confidence")}</th>
                      <th className="px-3 py-2">{t("bulk.wi.source")}</th>
                      <th className="px-3 py-2">{t("bulk.wi.pickCandidate")}</th>
                      <th className="px-3 py-2"> </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {matchRows.map((row) => {
                      const d = idToDraft.get(row.artwork_id);
                      const path = [...(d?.artwork_images ?? [])].sort(
                        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
                      )[0]?.storage_path;
                      const chosen = candidates.find((c) => c.id === row.chosen_candidate_id);
                      return (
                        <tr key={row.artwork_id} className="align-top">
                          <td className="px-3 py-2">
                            <div className="relative h-20 w-20 overflow-hidden rounded bg-zinc-100">
                              {path ? (
                                <Image
                                  src={getArtworkImageUrl(path, "thumb")}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  sizes="80px"
                                />
                              ) : (
                                <span className="text-xs text-zinc-400">—</span>
                              )}
                            </div>
                            <p className="mt-1 max-w-[10rem] truncate text-xs text-zinc-600">{d?.title ?? "—"}</p>
                          </td>
                          <td className="px-3 py-2">
                            <div className="relative h-20 w-20 overflow-hidden rounded bg-zinc-100">
                              {chosen?.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={chosen.image_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-xs text-zinc-400">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs">
                            <span
                              className={
                                row.match_status === "high_confidence"
                                  ? "rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900"
                                  : row.match_status === "review_needed"
                                    ? "rounded-full bg-amber-100 px-2 py-0.5 text-amber-900"
                                    : "rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600"
                              }
                            >
                              {statusLabel(row.match_status)}
                            </span>
                            <div className="mt-1 text-zinc-500">
                              {(row.confidence * 100).toFixed(0)}%
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {row.source_page_url ? (
                              <a
                                href={row.source_page_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-zinc-700 underline"
                              >
                                Link
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              className="max-w-[10rem] rounded border border-zinc-300 px-1 py-1 text-xs"
                              value={row.chosen_candidate_id ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                void handlePick(row.artwork_id, v === "" ? null : v);
                              }}
                              disabled={busy !== "idle"}
                            >
                              <option value="">—</option>
                              {(() => {
                                const topIds = new Set(row.top_matches.map((tm) => tm.candidate_id));
                                const chosenExtra =
                                  row.chosen_candidate_id && !topIds.has(row.chosen_candidate_id)
                                    ? candidates.find((x) => x.id === row.chosen_candidate_id)
                                    : null;
                                const list = [
                                  ...row.top_matches.map((tm) => ({ tm, c: candidates.find((x) => x.id === tm.candidate_id) })),
                                  ...(chosenExtra
                                    ? [{ tm: { candidate_id: chosenExtra.id, hamming: -1, dimension_bonus: 0 }, c: chosenExtra }]
                                    : []),
                                ];
                                return list.map(({ tm, c }) => (
                                  <option key={tm.candidate_id} value={tm.candidate_id}>
                                    {c?.parsed?.title ?? c?.alt_text ?? tm.candidate_id.slice(0, 6)}…
                                    {tm.hamming >= 0 ? ` (Δ${tm.hamming})` : ""}
                                  </option>
                                ));
                              })()}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <label className="flex items-center gap-2 text-xs text-zinc-700">
                              <input
                                type="checkbox"
                                checked={!!applyIds[row.artwork_id]}
                                onChange={(e) =>
                                  setApplyIds((prev) => ({ ...prev, [row.artwork_id]: e.target.checked }))
                                }
                              />
                              {t("bulk.wi.applyCheckbox")}
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy !== "idle"}
                  onClick={() => void handleApplySelected()}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {t("bulk.wi.applySelected")}
                </button>
                <button
                  type="button"
                  onClick={clearSession}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  {t("bulk.wi.newSession")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
