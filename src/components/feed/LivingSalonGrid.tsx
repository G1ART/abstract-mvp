"use client";

import type { LivingSalonItem } from "@/lib/feed/livingSalon";
import { FeedArtworkCard } from "@/components/FeedArtworkCard";
import { ArtistWorldStrip } from "./ArtistWorldStrip";
import { ExhibitionMemoryStrip } from "./ExhibitionMemoryStrip";

type Props = {
  items: LivingSalonItem[];
  likedIds: Set<string>;
  followingIds: Set<string>;
  userId: string | null;
  onLikeUpdate: (artworkId: string, liked: boolean, count: number) => void;
};

/**
 * Living Salon grid — 12-column on desktop, 6-column on tablet, 2-column on
 * mobile. Standard artworks span 4/3/1; anchor artworks span 6/6/1 (mobile
 * falls back to a standard tile so we never produce a full-width hero on
 * small screens). All cells are aligned to the row start so a tall context
 * strip or a slightly larger anchor never stretches the rest of the row.
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
    <div className="grid auto-rows-min grid-cols-2 items-start gap-4 md:grid-cols-6 lg:grid-cols-12 lg:gap-5">
      {items.map((item, idx) => {
        if (item.kind === "artwork") {
          const isAnchor = item.variant === "anchor";
          // Mobile fallback: anchors fold back into a standard tile so we
          // never produce a full-viewport hero on small screens (Work Order
          // §2.1). Desktop and tablet keep the wider 6-col span.
          const span = isAnchor
            ? "col-span-1 md:col-span-6 lg:col-span-6"
            : "col-span-1 md:col-span-3 lg:col-span-4";
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
                showPrice
              />
            </div>
          );
        }

        if (item.kind === "exhibition_strip") {
          return (
            <div
              key={item.key}
              className="col-span-2 min-w-0 md:col-span-6 lg:col-span-8"
            >
              <ExhibitionMemoryStrip exhibition={item.exhibition} />
            </div>
          );
        }

        return (
          <div
            key={item.key}
            className="col-span-2 min-w-0 md:col-span-6 lg:col-span-12"
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
