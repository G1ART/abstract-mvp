"use client";

import { useEffect, useMemo, useRef } from "react";
import type { LivingSalonItem } from "@/lib/feed/livingSalon";
import {
  createImpressionTracker,
  type FeedItemKind,
  type FeedSort,
  type FeedTab,
  type ImpressionPayload,
  type ImpressionTracker,
} from "@/lib/feed/telemetry";
import { FeedArtworkCard } from "@/components/FeedArtworkCard";
import { ExhibitionMemoryStrip } from "./ExhibitionMemoryStrip";
import { PeopleCarouselStrip } from "./PeopleCarouselStrip";

type Props = {
  items: LivingSalonItem[];
  likedIds: Set<string>;
  followingIds: Set<string>;
  userId: string | null;
  onLikeUpdate: (artworkId: string, liked: boolean, count: number) => void;
  /** Active feed tab — propagates into impression / click telemetry. */
  tab: FeedTab;
  /** Active sort key — only meaningful on the recommended/all tab. */
  sort?: FeedSort;
};

function kindToTelemetry(item: LivingSalonItem): FeedItemKind {
  switch (item.kind) {
    case "artwork":
      return "artwork";
    case "exhibition_strip":
      return "exhibition";
    case "people_cluster":
      return "people";
  }
}

function itemTelemetryId(item: LivingSalonItem): string {
  switch (item.kind) {
    case "artwork":
      return item.artwork.id;
    case "exhibition_strip":
      return item.exhibition.id;
    case "people_cluster":
      return item.persona;
  }
}

/**
 * Living Salon grid — Editorial Hybrid (Option C).
 *
 * - 4-column base on desktop, 3-column on tablet, 2-column on mobile.
 * - Standard artworks: `col-span-1`.
 * - Anchor artworks: become a 2x2 spotlight on `lg+`; on mobile/tablet they
 *   fold back into a standard tile so we never produce a full-viewport hero
 *   on small screens (Work Order §2.1).
 * - `grid-auto-flow: dense` so the cell adjacent to a spotlight is filled by
 *   the next standard tile rather than left empty.
 * - `auto-rows-min items-start` so a tall context strip or spotlight never
 *   stretches sibling rows.
 * - `gap-x-6 gap-y-10` (24/40px) to give artworks room to breathe like a
 *   magazine spread instead of a commodity grid.
 *
 * The grid is intentionally a thin renderer — the rhythm and dedupe live in
 * `buildLivingSalonItems`, so this component just maps `LivingSalonItem` to
 * the matching span and component.
 */
export function LivingSalonGrid({
  items,
  likedIds,
  followingIds,
  userId,
  onLikeUpdate,
  tab,
  sort,
}: Props) {
  // One IntersectionObserver per (tab, sort) pair. We rebuild on tab/sort
  // change because the per-session dedup key includes them — so a user
  // toggling between Recommended and Following can still be observed
  // independently per surface.
  const tracker = useMemo<ImpressionTracker>(
    () => createImpressionTracker({ tab, sort }),
    [tab, sort]
  );

  // Refs keyed by item.key so a re-render after `loadMore` does not double-
  // observe nodes that already have a pending dwell timer.
  const refMap = useRef<Map<string, Element>>(new Map());

  useEffect(() => {
    return () => {
      tracker.disconnect();
      refMap.current.clear();
    };
  }, [tracker]);

  function attachRef(key: string, payload: ImpressionPayload) {
    return (el: HTMLDivElement | null) => {
      if (!el) {
        refMap.current.delete(key);
        return;
      }
      // observe() de-dupes per-element internally.
      refMap.current.set(key, el);
      tracker.observe(el, payload);
    };
  }

  return (
    <div className="grid auto-rows-min grid-cols-2 items-start gap-x-6 gap-y-10 [grid-auto-flow:dense] md:grid-cols-3 lg:grid-cols-4">
      {items.map((item, idx) => {
        const position = idx + 1;
        const payload: ImpressionPayload = {
          item_kind: kindToTelemetry(item),
          item_key: item.key,
          item_id: itemTelemetryId(item),
          position,
        };

        if (item.kind === "artwork") {
          const isAnchor = item.variant === "anchor";
          const span = isAnchor
            ? "col-span-1 lg:col-span-2 lg:row-span-2"
            : "col-span-1";
          const isPriority = idx < 2 || isAnchor;
          return (
            <div
              key={item.key}
              ref={attachRef(item.key, payload)}
              className={`min-w-0 ${span}`}
            >
              <FeedArtworkCard
                artwork={item.artwork}
                likedIds={likedIds}
                userId={userId}
                onLikeUpdate={onLikeUpdate}
                priority={isPriority}
                variant={isAnchor ? "feedAnchor" : "feedTile"}
                feedContext={{ tab, sort, position }}
              />
            </div>
          );
        }

        if (item.kind === "exhibition_strip") {
          return (
            <div
              key={item.key}
              ref={attachRef(item.key, payload)}
              className="col-span-2 min-w-0 md:col-span-3 lg:col-span-4"
            >
              <ExhibitionMemoryStrip
                exhibition={item.exhibition}
                feedContext={{ tab, sort, position }}
              />
            </div>
          );
        }

        return (
          <div
            key={item.key}
            ref={attachRef(item.key, payload)}
            className="col-span-2 min-w-0 md:col-span-3 lg:col-span-4"
          >
            <PeopleCarouselStrip
              persona={item.persona}
              profiles={item.profiles}
              followingIds={followingIds}
              userId={userId}
              feedContext={{ tab, sort, position }}
            />
          </div>
        );
      })}
    </div>
  );
}
