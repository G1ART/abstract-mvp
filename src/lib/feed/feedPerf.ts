"use client";

const PREFIX = "ab_feed_perf_";

export function markFeedPerf(key: string, value?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      PREFIX + key,
      value ?? String(Date.now())
    );
  } catch {
    /* ignore */
  }
}

export function readFeedPerf(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}
