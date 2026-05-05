"use client";

/**
 * Feed-surface telemetry foundation (Sprint 1).
 *
 * Goal: a *single* place that knows how to emit feed-related product events
 * with consistent metadata, debounced impressions, and lightweight click
 * source tracking — so individual cards/components do not have to reinvent
 * dedupe / IntersectionObserver / session id logic.
 *
 * Principles (mirrors `Sprint1` work order §B):
 * - Fire-and-forget — never throws, never blocks render.
 * - Privacy-safe — IDs only; no titles, no image URLs, no user-typed text.
 * - Dedupe per `(tab, sort, item_key)` per *session*, persisted in
 *   sessionStorage so quick remounts do not re-fire.
 * - Debounced via 350ms dwell threshold so a flicked-through item does not
 *   count as an impression (matches feed editorial intent).
 * - Composable: `createImpressionTracker` exposes a tiny observe/disconnect
 *   contract that the grid can wire to a card-level `ref`.
 *
 * The helper sits beside `livingSalon.ts` so the same module that *describes*
 * a feed item also owns *measuring* it — keeping the salon vocabulary in one
 * folder.
 */

import { logBetaEvent, type BetaEventName } from "@/lib/beta/logEvent";

const SESSION_ID_KEY = "ab_feed_session_id";
const IMPRESSION_DEDUP_KEY = "ab_feed_impressions_v1";
const FEED_SOURCE_KEY = "ab_feed_click_source";

/**
 * Pinned alongside the grid renderer. Bumping this version invalidates
 * downstream dashboards' filter on `layout_version` so the new mix is not
 * silently averaged with a previous shape.
 */
export const FEED_LAYOUT_VERSION = "living_salon_v1.7_incremental";

export type FeedSurface = "feed";
export type FeedTab = "all" | "following";
export type FeedSort = "latest" | "popular";

/**
 * Coarse item kinds that the salon currently emits. Distinct from
 * `LivingSalonItem.kind` because dashboards use the shorter names; mapping
 * happens in `livingSalonKindToTelemetryKind`.
 */
export type FeedItemKind = "artwork" | "exhibition" | "people";

export type FeedEventBase = {
  tab: FeedTab;
  sort?: FeedSort;
  item_kind?: FeedItemKind;
  item_id?: string;
  /** 1-based position in the rendered Living Salon presentation. */
  position?: number;
  layout_version?: string;
  /** Free-form additional metadata (must remain privacy-safe). */
  [extra: string]: unknown;
};

function ensureSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(SESSION_ID_KEY, id);
    return id;
  } catch {
    return "no-storage";
  }
}

/**
 * Emit a feed-surface event with the standard envelope. Always fires
 * `surface: "feed"` and the active `layout_version` / `session_id` so a
 * downstream query never needs to fold those fields manually.
 */
export function logFeedEvent(
  eventName: Extract<
    BetaEventName,
    | "feed_loaded"
    | "feed_first_paint"
    | "feed_load_more"
    | "feed_item_impression"
    | "feed_item_click"
    | "feed_item_like_or_save"
    | "feed_item_follow"
    | "feed_item_inquiry_click"
    | "profile_view_from_feed"
    | "exhibition_view_from_feed"
  >,
  base: FeedEventBase
): void {
  void logBetaEvent(eventName, {
    surface: "feed",
    session_id: ensureSessionId(),
    layout_version: base.layout_version ?? FEED_LAYOUT_VERSION,
    ...base,
  });
}

// ── Impression dedup ────────────────────────────────────────────────

function dedupKeyForImpression(
  itemKey: string,
  tab: FeedTab,
  sort: FeedSort | undefined
): string {
  return `${tab}:${sort ?? "_"}:${itemKey}`;
}

function loadImpressionDedup(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(IMPRESSION_DEDUP_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function saveImpressionDedup(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    // Cap stored entries so a long-living tab does not bloat sessionStorage.
    // Most-recent-wins via array tail.
    const arr = Array.from(set);
    const capped = arr.length > 600 ? arr.slice(arr.length - 600) : arr;
    window.sessionStorage.setItem(
      IMPRESSION_DEDUP_KEY,
      JSON.stringify(capped)
    );
  } catch {
    /* ignore */
  }
}

export type ImpressionPayload = {
  item_kind: FeedItemKind;
  /** Stable key from the salon builder (`art-…` / `exh-…` / `pc-…`). */
  item_key: string;
  /** Coarse content id where available (artwork id, exhibition id, persona). */
  item_id?: string;
  /** 1-based position in the rendered presentation list. */
  position: number;
};

export type ImpressionTracker = {
  /** Begin observing a card root element with the given payload. */
  observe: (el: Element, payload: ImpressionPayload) => void;
  /** Cancel any pending dwell timers without disconnecting. */
  flush: () => void;
  /** Stop observing everything and release the IntersectionObserver. */
  disconnect: () => void;
};

const IMPRESSION_THRESHOLD = 0.5;
const IMPRESSION_DWELL_MS = 350;

/**
 * Create an impression tracker scoped to one (tab, sort) pair.
 *
 * Internally:
 *   - one shared IntersectionObserver per tracker;
 *   - per-element pending timer; only fires after `IMPRESSION_DWELL_MS`
 *     of continuous >50% visibility;
 *   - dedupe persists in sessionStorage keyed by `(tab, sort, item_key)`,
 *     so re-renders, tab swaps in & out, and back-navigation never count
 *     the same item twice.
 *
 * Caller pattern:
 *   const tracker = useMemo(() => createImpressionTracker({ tab, sort }), [tab, sort]);
 *   useEffect(() => () => tracker.disconnect(), [tracker]);
 *   <div ref={(el) => el && tracker.observe(el, payload)} />
 */
export function createImpressionTracker(opts: {
  tab: FeedTab;
  sort?: FeedSort;
}): ImpressionTracker {
  const seen = loadImpressionDedup();
  const pending = new Map<
    Element,
    { payload: ImpressionPayload; timer: number | null }
  >();

  if (
    typeof window === "undefined" ||
    typeof IntersectionObserver === "undefined"
  ) {
    return { observe: () => {}, flush: () => {}, disconnect: () => {} };
  }

  let observer: IntersectionObserver | null = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const slot = pending.get(entry.target);
        if (!slot) continue;
        if (
          entry.isIntersecting &&
          entry.intersectionRatio >= IMPRESSION_THRESHOLD
        ) {
          if (slot.timer == null) {
            slot.timer = window.setTimeout(() => {
              const dedupKey = dedupKeyForImpression(
                slot.payload.item_key,
                opts.tab,
                opts.sort
              );
              if (!seen.has(dedupKey)) {
                seen.add(dedupKey);
                saveImpressionDedup(seen);
                logFeedEvent("feed_item_impression", {
                  tab: opts.tab,
                  sort: opts.sort,
                  item_kind: slot.payload.item_kind,
                  item_id: slot.payload.item_id,
                  position: slot.payload.position,
                });
              }
              observer?.unobserve(entry.target);
              pending.delete(entry.target);
            }, IMPRESSION_DWELL_MS);
          }
        } else if (slot.timer != null) {
          window.clearTimeout(slot.timer);
          slot.timer = null;
        }
      }
    },
    { threshold: [IMPRESSION_THRESHOLD] }
  );

  return {
    observe(el, payload) {
      if (!observer) return;
      // Avoid double-observing the same node when a parent re-runs effects.
      if (pending.has(el)) return;
      pending.set(el, { payload, timer: null });
      observer.observe(el);
    },
    flush() {
      for (const slot of pending.values()) {
        if (slot.timer != null) window.clearTimeout(slot.timer);
        slot.timer = null;
      }
    },
    disconnect() {
      for (const slot of pending.values()) {
        if (slot.timer != null) window.clearTimeout(slot.timer);
      }
      pending.clear();
      observer?.disconnect();
      observer = null;
    },
  };
}

// ── Feed click source tracking ─────────────────────────────────────
//
// Stored when a user activates an item from the feed. Read on the
// destination surface (e.g. artwork detail) so a later side-action
// (inquiry click, follow) can be correctly attributed to a feed origin.

export type FeedSourceContext = {
  surface: FeedSurface;
  tab: FeedTab;
  sort?: FeedSort;
  item_kind: FeedItemKind;
  item_id: string;
  position: number;
  ts: number;
};

const FEED_SOURCE_TTL_MS = 30 * 60 * 1000;

export function setFeedSource(
  ctx: Omit<FeedSourceContext, "ts" | "surface">
): void {
  if (typeof window === "undefined") return;
  try {
    const value: FeedSourceContext = {
      ...ctx,
      surface: "feed",
      ts: Date.now(),
    };
    window.sessionStorage.setItem(FEED_SOURCE_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/**
 * Read the most recent feed source without clearing it. Useful when a
 * destination surface needs to attribute multiple downstream events
 * (e.g. inquiry click + inquiry created).
 */
export function peekFeedSource(): FeedSourceContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FEED_SOURCE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeedSourceContext;
    if (!parsed?.ts || Date.now() - parsed.ts > FEED_SOURCE_TTL_MS) {
      window.sessionStorage.removeItem(FEED_SOURCE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Read and clear the feed source — call this once after attribution. */
export function consumeFeedSource(): FeedSourceContext | null {
  const value = peekFeedSource();
  if (!value) return null;
  if (typeof window === "undefined") return value;
  try {
    window.sessionStorage.removeItem(FEED_SOURCE_KEY);
  } catch {
    /* ignore */
  }
  return value;
}
