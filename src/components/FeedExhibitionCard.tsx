"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import type { ExhibitionRow } from "@/lib/supabase/exhibitions";
import Image from "next/image";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";

type Props = {
  exhibition: ExhibitionRow;
};

export function FeedExhibitionCard({ exhibition }: Props) {
  const { t } = useT();
  const period =
    exhibition.start_date && exhibition.end_date
      ? `${exhibition.start_date} – ${exhibition.end_date}`
      : exhibition.start_date ?? exhibition.status;
  const venue = exhibition.host_name ?? "-";
  const thumbs = (exhibition.cover_image_paths ?? []).slice(0, 3);

  return (
    <Link
      href={`/e/${exhibition.id}`}
      className="group block overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {t("feed.recommendedLabel")} · {t("exhibition.myExhibitions")}
          </p>
          <p className="mt-0.5 line-clamp-1 font-semibold text-zinc-900">{exhibition.title}</p>
          <p className="mt-1 line-clamp-1 text-xs text-zinc-600">
            {t("exhibition.startDate")}: {period}
          </p>
          <p className="line-clamp-1 text-xs text-zinc-600">
            {t("exhibition.hostName")}: {venue}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-zinc-500 group-hover:text-zinc-700">→</span>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-zinc-200 p-4">
        {(thumbs.length > 0 ? thumbs : [null, null, null]).map((path, idx) => (
          <div
            key={`${path ?? "empty"}-${idx}`}
            className="relative aspect-square overflow-hidden rounded border border-zinc-200 bg-zinc-100"
          >
            {path ? (
              <Image
                src={getArtworkImageUrl(path, "medium")}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 768px) 33vw, 180px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-300">·</div>
            )}
          </div>
        ))}
      </div>
    </Link>
  );
}
