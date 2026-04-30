"use client";

import Image from "next/image";
import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import {
  type ExhibitionWithCredits,
  getExhibitionHostCuratorLabel,
} from "@/lib/exhibitionCredits";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";

type Props = {
  exhibition: ExhibitionWithCredits;
};

/**
 * Living Salon "Exhibition memory" strip — replaces the older exhibition
 * card. Reads as context, not as a marketplace listing: hairlines top and
 * bottom (no card box, no shadow), a discreet uppercase label, the
 * host/curator credit line, the title, the period, and up to three
 * thumb-sized images. When there are no covers, the thumbnail row collapses
 * and the strip stays text-forward instead of showing empty placeholders.
 */
export function ExhibitionMemoryStrip({ exhibition }: Props) {
  const { t } = useT();
  const period =
    exhibition.start_date && exhibition.end_date
      ? `${exhibition.start_date} – ${exhibition.end_date}`
      : exhibition.start_date ?? exhibition.status ?? "";
  const creditsLine = getExhibitionHostCuratorLabel(exhibition, t);
  const thumbs = (exhibition.cover_image_paths ?? []).slice(0, 3);
  const hasThumbs = thumbs.length > 0;

  return (
    <Link
      href={`/e/${exhibition.id}`}
      className="group block border-y border-zinc-100 py-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
    >
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            {t("feed.exhibitionMemoryLabel")}
          </p>
          {creditsLine && (
            <p className="mt-1.5 line-clamp-1 text-xs font-medium tracking-tight text-zinc-600">
              {creditsLine}
            </p>
          )}
          <h3 className="mt-1 line-clamp-2 text-base font-semibold tracking-tight text-zinc-900 sm:text-lg">
            {exhibition.title}
          </h3>
          {period && (
            <p className="mt-1.5 line-clamp-1 text-xs tracking-tight text-zinc-500">
              {period}
            </p>
          )}
        </div>
        <span
          aria-hidden
          className="shrink-0 self-center text-sm font-medium tracking-tight text-zinc-500 underline-offset-4 transition-colors group-hover:text-zinc-900 group-hover:underline"
        >
          {t("feed.viewExhibition")}
          <span className="ml-1" aria-hidden>
            →
          </span>
        </span>
      </div>

      {hasThumbs && (
        <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
          {thumbs.map((path, idx) => (
            <div
              key={`${path}-${idx}`}
              className="relative aspect-square overflow-hidden bg-zinc-50"
            >
              <Image
                src={getArtworkImageUrl(path, "thumb")}
                alt=""
                fill
                className="object-contain"
                sizes="(max-width: 768px) 33vw, 200px"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
