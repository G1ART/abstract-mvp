"use client";

/**
 * Remembers the last tone preset a user chose for a given AI assist
 * surface. Lives only in `localStorage` — nothing is synced to the DB,
 * the server never reads this, and clearing storage fully resets it. We
 * keep the keys short and namespaced under `ai.tone.*` so they don't
 * collide with other product state.
 */

type Surface = "bio" | "inquiry" | "inquiryLength";

function storageKey(surface: Surface): string {
  return `ai.tone.${surface}`;
}

function isStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

export function readTone<T extends string>(
  surface: Surface,
  allowed: readonly T[],
  fallback: T,
): T {
  if (!isStorageAvailable()) return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(surface));
    if (!raw) return fallback;
    return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeTone(surface: Surface, value: string): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(storageKey(surface), value);
  } catch {
    /* best-effort only */
  }
}
