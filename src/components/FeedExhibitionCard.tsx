"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import type { ExhibitionRow } from "@/lib/supabase/exhibitions";
import { ExhibitionThumbStack } from "./ExhibitionThumbStack";

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

  return (
    <Link
      href={`/e/${exhibition.id}`}
      className="group block overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-3 p-3 sm:p-4">
        <ExhibitionThumbStack
          paths={exhibition.cover_image_paths}
          ratio="landscape"
          imageVariant="medium"
          className="w-28 shrink-0 sm:w-36"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {t("feed.recommendedLabel")} · {t("exhibition.myExhibitions")}
          </p>
          <p className="mt-0.5 truncate font-semibold text-zinc-900">{exhibition.title}</p>
          <p className="mt-1 truncate text-xs text-zinc-600">
            {t("exhibition.startDate")}: {period}
          </p>
          <p className="truncate text-xs text-zinc-600">
            {t("exhibition.hostName")}: {venue}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-zinc-500 group-hover:text-zinc-700">→</span>
      </div>
    </Link>
  );
}
