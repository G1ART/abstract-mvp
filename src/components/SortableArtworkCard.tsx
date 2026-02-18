"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ArtworkWithLikes } from "@/lib/supabase/artworks";
import { ArtworkCard } from "./ArtworkCard";

function GripIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="6" cy="4" r="1.5" />
      <circle cx="10" cy="4" r="1.5" />
      <circle cx="6" cy="8" r="1.5" />
      <circle cx="10" cy="8" r="1.5" />
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="10" cy="12" r="1.5" />
    </svg>
  );
}

type Props = {
  artwork: ArtworkWithLikes;
  likesCount: number;
  isLiked: boolean;
  viewerId?: string | null;
  onLikeUpdate: (artworkId: string, liked: boolean, count: number) => void;
};

export function SortableArtworkCard({ artwork, likesCount, isLiked, viewerId = null, onLikeUpdate }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: artwork.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-50" : ""}
    >
      <ArtworkCard
        artwork={artwork}
        viewerId={viewerId}
        likesCount={likesCount}
        isLiked={isLiked}
        onLikeUpdate={onLikeUpdate}
        disableNavigation
        dragHandle={
          <button
            type="button"
            className="cursor-grab touch-none text-zinc-400 hover:text-zinc-600 active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            <GripIcon />
          </button>
        }
      />
    </div>
  );
}
