"use client";

import Image from "next/image";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";
import { useT } from "@/lib/i18n/useT";

type SortedImage = {
  storage_path: string;
};

/**
 * Sprint 4 — extracted Passport image stage.
 *
 * Owns ONLY the visual contract for the artwork image and the desktop
 * "open at original size" modal:
 *   - 1:1 matte container, `object-contain` so artworks with unusual
 *     aspect ratios are NEVER cropped (the work-order's "no forced
 *     full-screen crop" rule).
 *   - Desktop click-to-open behaviour gated on `isDesktop` so mobile
 *     users don't get a pointer cursor that does nothing on touch.
 *   - Modal is identity-stable: open/close lives in the parent so any
 *     other effect (e.g. `useEffect` cleanup on Escape) keeps working
 *     unchanged.
 *
 * No state of its own. All toggles flow through the parent — extraction
 * is intentionally cheap to revert if a future sprint needs to re-fold
 * the image stage back into the page.
 */
export function ArtworkImageStage({
  sortedImages,
  title,
  isDesktop,
  fullSizeOpen,
  onOpenFullSize,
  onCloseFullSize,
}: {
  sortedImages: SortedImage[];
  title: string | null;
  isDesktop: boolean;
  fullSizeOpen: boolean;
  onOpenFullSize: () => void;
  onCloseFullSize: () => void;
}) {
  const { t } = useT();
  const hasImage = sortedImages.length > 0;
  const canOpen = isDesktop && hasImage;
  const altLabel = title ?? t("common.untitled");

  return (
    <>
      <div
        className={`aspect-square w-full overflow-hidden rounded-lg bg-zinc-100 ${canOpen ? "cursor-zoom-in" : ""}`}
        role={canOpen ? "button" : undefined}
        tabIndex={canOpen ? 0 : undefined}
        onClick={() => {
          if (canOpen) onOpenFullSize();
        }}
        onKeyDown={(e) => {
          if (!canOpen) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenFullSize();
          }
        }}
      >
        {hasImage ? (
          <Image
            src={getArtworkImageUrl(sortedImages[0].storage_path, "medium")}
            alt={altLabel}
            width={600}
            height={600}
            sizes="(max-width: 768px) 100vw, 600px"
            priority
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
            {t("artwork.noImage")}
          </div>
        )}
      </div>
      {fullSizeOpen && hasImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={altLabel}
          onClick={onCloseFullSize}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getArtworkImageUrl(sortedImages[0].storage_path, "original")}
            alt={altLabel}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
