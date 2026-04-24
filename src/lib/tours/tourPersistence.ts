"use client";

/**
 * Persistence layer for tour progress.
 *
 * Strategy:
 * - Primary store: `user_tour_state` table, keyed by (user_id, tour_id).
 *   Survives devices/browsers; respects beta per-user preferences.
 * - Local fallback: `localStorage` mirror so:
 *     (a) logged-out users still get sensible once-only behavior
 *     (b) boot is instant; we don't block the UI on network
 *     (c) writes are optimistic (localStorage first, DB best-effort)
 *
 * All calls are non-throwing; failures are swallowed so tours never crash
 * the app.
 */

import { supabase } from "@/lib/supabase/client";
import type { TourState, TourStatus } from "./tourTypes";

const LS_PREFIX = "abstract.tour.v1.";

function lsKey(tourId: string): string {
  return `${LS_PREFIX}${tourId}`;
}

function readLocal(tourId: string): TourState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(lsKey(tourId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TourState>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.tourId !== "string") return null;
    if (typeof parsed.version !== "number") return null;
    return {
      tourId: parsed.tourId,
      version: parsed.version,
      status: (parsed.status as TourStatus) ?? "not_seen",
      lastStep: typeof parsed.lastStep === "number" ? parsed.lastStep : 0,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeLocal(state: TourState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lsKey(state.tourId), JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

async function readRemote(tourId: string): Promise<TourState | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return null;
    const { data, error } = await supabase
      .from("user_tour_state")
      .select("tour_id, version, status, last_step, updated_at")
      .eq("user_id", uid)
      .eq("tour_id", tourId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      tourId: data.tour_id as string,
      version: data.version as number,
      status: data.status as TourStatus,
      lastStep: (data.last_step as number) ?? 0,
      updatedAt: (data.updated_at as string) ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function writeRemote(state: TourState): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    await supabase.from("user_tour_state").upsert(
      {
        user_id: uid,
        tour_id: state.tourId,
        version: state.version,
        status: state.status,
        last_step: state.lastStep,
        updated_at: state.updatedAt,
      },
      { onConflict: "user_id,tour_id" }
    );
  } catch {
    /* ignore */
  }
}

/**
 * Loads the freshest known state.
 * Prefers remote (source of truth) when available; otherwise falls back to
 * local. Always returns immediately with local first, then best-effort
 * upgrades via remote.
 */
export async function loadTourState(tourId: string): Promise<TourState | null> {
  const local = readLocal(tourId);
  const remote = await readRemote(tourId);
  if (remote) {
    // Reconcile: remote wins; mirror to local for next boot speed.
    writeLocal(remote);
    return remote;
  }
  return local;
}

/** Synchronous local read (used during provider bootstrap to pick up SSR-safe defaults). */
export function loadTourStateLocal(tourId: string): TourState | null {
  return readLocal(tourId);
}

export async function saveTourState(state: TourState): Promise<void> {
  writeLocal(state);
  await writeRemote(state);
}

/** Convenience helpers for reducer-like transitions. */
export function makeState(
  tourId: string,
  version: number,
  status: TourStatus,
  lastStep: number
): TourState {
  return {
    tourId,
    version,
    status,
    lastStep,
    updatedAt: new Date().toISOString(),
  };
}
