/**
 * DOM-side helpers for the tour framework.
 * Pure client helpers; never imported on the server.
 */

export function findTourTarget(anchor: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(`[data-tour="${cssEscape(anchor)}"]`);
}

export function cssEscape(value: string): string {
  // Fallback CSS.escape polyfill for anchors that might contain odd chars.
  const w = typeof window !== "undefined" ? (window as unknown as { CSS?: { escape?: (s: string) => string } }) : null;
  if (w?.CSS?.escape) return w.CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

export type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/** Returns a viewport-relative rect (like getBoundingClientRect). */
export function measureTarget(el: HTMLElement | null): TargetRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Smoothly scrolls the target into view if it's off-screen. */
export function ensureTargetVisible(el: HTMLElement | null): void {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const fullyVisible =
    rect.top >= 72 && rect.bottom <= vh - 24 && rect.left >= 0 && rect.right <= vw;
  if (fullyVisible) return;
  try {
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  } catch {
    el.scrollIntoView();
  }
}

/** Waits for an anchor to appear in the DOM (async content). Resolves null after timeoutMs. */
export function waitForTourTarget(
  anchor: string,
  timeoutMs = 1200
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const existing = findTourTarget(anchor);
    if (existing) {
      resolve(existing);
      return;
    }
    let done = false;
    const obs = new MutationObserver(() => {
      const el = findTourTarget(anchor);
      if (el) {
        done = true;
        obs.disconnect();
        resolve(el);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      if (done) return;
      obs.disconnect();
      resolve(findTourTarget(anchor));
    }, timeoutMs);
  });
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
