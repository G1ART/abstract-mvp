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
 * Living Salon "Exhibition memory" strip — context, not commerce. The
 * strip is a two-column row on `sm+`: meta (label / credit / title /
 * period / text action) on the left, a small dynamic thumb grid on the
 * right (its width is capped at ~44% so each thumb is about half the
 * size of the previous strip's thumbs — visible enough to set the mood,
 * small enough to feel like a discovery hook).
 *
 * The builder gates exhibitions to those with `cover_image_paths.length
 * >= 2`, so this component never has to render a single floating thumb
 * or an empty placeholder grid.
 */
export function ExhibitionMemoryStrip({ exhibition }: Props) {
  const { t } = useT();
  const period =
    exhibition.start_date && exhibition.end_date
      ? `${exhibition.start_date} – ${exhibition.end_date}`
      : exhibition.start_date ?? exhibition.status ?? "";
  const creditsLine = getExhibitionHostCuratorLabel(exhibition, t);
  const thumbs = (exhibition.cover_image_paths ?? []).slice(0, 3);
  const thumbGridCols = thumbs.length === 2 ? "grid-cols-2" : "grid-cols-3";

  return (
    <Link
      href={`/e/${exhibition.id}`}
      className="group block border-y border-zinc-100 py-8 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10">
        <div className="flex min-w-0 flex-1 items-start gap-6">
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
            className="shrink-0 self-start pt-1 text-sm font-medium tracking-tight text-zinc-500 underline-offset-4 transition-colors group-hover:text-zinc-900 group-hover:underline"
          >
            {t("feed.viewExhibition")}
            <span className="ml-1" aria-hidden>
              →
            </span>
          </span>
        </div>

        {thumbs.length > 0 && (
          <div
            className={`grid w-full ${thumbGridCols} gap-2 sm:max-w-[44%] sm:gap-3`}
          >
            {thumbs.map((path, idx) => (
              <div
                key={`${path}-${idx}`}
                className="relative aspect-square overflow-hidden"
              >
                <Image
                  src={getArtworkImageUrl(path, "thumb")}
                  alt=""
                  fill
                  className="object-contain"
                  sizes="(max-width: 640px) 28vw, 160px"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
