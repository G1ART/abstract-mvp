"use client";

import type { LivingSalonItem } from "@/lib/feed/livingSalon";
import { FeedArtworkCard } from "@/components/FeedArtworkCard";
import { ArtistWorldStrip } from "./ArtistWorldStrip";
import { ExhibitionMemoryStrip } from "./ExhibitionMemoryStrip";
import { PeopleClusterStrip } from "./PeopleClusterStrip";

type Props = {
  items: LivingSalonItem[];
  likedIds: Set<string>;
  followingIds: Set<string>;
  userId: string | null;
  onLikeUpdate: (artworkId: string, liked: boolean, count: number) => void;
};

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
}: Props) {
  return (
    <div className="grid auto-rows-min grid-cols-2 items-start gap-x-6 gap-y-10 [grid-auto-flow:dense] md:grid-cols-3 lg:grid-cols-4">
      {items.map((item, idx) => {
        if (item.kind === "artwork") {
          const isAnchor = item.variant === "anchor";
          const span = isAnchor
            ? "col-span-1 lg:col-span-2 lg:row-span-2"
            : "col-span-1";
          const isPriority = idx < 2 || isAnchor;
          return (
            <div key={item.key} className={`min-w-0 ${span}`}>
              <FeedArtworkCard
                artwork={item.artwork}
                likedIds={likedIds}
                userId={userId}
                onLikeUpdate={onLikeUpdate}
                priority={isPriority}
                variant={isAnchor ? "feedAnchor" : "feedTile"}
              />
            </div>
          );
        }

        if (item.kind === "exhibition_strip") {
          return (
            <div
              key={item.key}
              className="col-span-2 min-w-0 md:col-span-3 lg:col-span-4"
            >
              <ExhibitionMemoryStrip exhibition={item.exhibition} />
            </div>
          );
        }

        if (item.kind === "people_cluster") {
          return (
            <div
              key={item.key}
              className="col-span-2 min-w-0 md:col-span-3 lg:col-span-4"
            >
              <PeopleClusterStrip
                persona={item.persona}
                profiles={item.profiles}
                followingIds={followingIds}
                userId={userId}
              />
            </div>
          );
        }

        return (
          <div
            key={item.key}
            className="col-span-2 min-w-0 md:col-span-3 lg:col-span-4"
          >
            <ArtistWorldStrip
              profile={item.profile}
              artworks={item.artworks}
              likedIds={likedIds}
              initialFollowing={followingIds.has(item.profile.id)}
              userId={userId}
              onLikeUpdate={onLikeUpdate}
            />
          </div>
        );
      })}
    </div>
  );
}
