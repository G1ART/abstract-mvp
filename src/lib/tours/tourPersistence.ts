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

/**
 * v2 keys are scoped by user id (or "anon" when logged out) so that
 * multiple accounts on the same browser do not see each other's
 * "completed" tour state. v1 keys (un-scoped) are kept readable as a
 * one-time migration source so existing users don't get the tour shown
 * to them again after this rollout.
 */
const LS_PREFIX_V1 = "abstract.tour.v1.";
const LS_PREFIX_V2 = "abstract.tour.v2.";

function lsKeyV1(tourId: string): string {
  return `${LS_PREFIX_V1}${tourId}`;
}

function lsKey(tourId: string, userId: string): string {
  return `${LS_PREFIX_V2}${userId}.${tourId}`;
}

async function currentUserScope(): Promise<string> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user?.id ?? "anon";
  } catch {
    return "anon";
  }
}

function parseState(raw: string | null): TourState | null {
  if (!raw) return null;
  try {
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

async function readLocalScoped(tourId: string): Promise<TourState | null> {
  if (typeof window === "undefined") return null;
  const userId = await currentUserScope();
  const v2 = parseState(window.localStorage.getItem(lsKey(tourId, userId)));
  if (v2) return v2;
  // One-time migration: read v1 key. Only migrate when logged in so we
  // don't leak an anonymous "completed" state to a freshly signed-in user.
  if (userId !== "anon") {
    const v1 = parseState(window.localStorage.getItem(lsKeyV1(tourId)));
    if (v1) {
      try {
        window.localStorage.setItem(lsKey(tourId, userId), JSON.stringify(v1));
      } catch {
        /* ignore quota */
      }
      return v1;
    }
  }
  return null;
}

async function writeLocalScoped(state: TourState): Promise<void> {
  if (typeof window === "undefined") return;
  const userId = await currentUserScope();
  try {
    window.localStorage.setItem(lsKey(state.tourId, userId), JSON.stringify(state));
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
 * the user-scoped local mirror. We never return another user's local state
 * to a freshly signed-in user (see `readLocalScoped`).
 */
export async function loadTourState(tourId: string): Promise<TourState | null> {
  const remote = await readRemote(tourId);
  if (remote) {
    await writeLocalScoped(remote);
    return remote;
  }
  return readLocalScoped(tourId);
}

export async function saveTourState(state: TourState): Promise<void> {
  await writeLocalScoped(state);
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
