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
  const dates =
    exhibition.start_date && exhibition.end_date
      ? `${exhibition.start_date} – ${exhibition.end_date}`
      : exhibition.start_date ?? exhibition.status;
  const subtitle = [dates, exhibition.host_name].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/e/${exhibition.id}`}
      className="block overflow-hidden rounded-xl border border-zinc-200 bg-white transition-shadow hover:shadow-md"
    >
      <ExhibitionThumbStack paths={exhibition.cover_image_paths} />
      <div className="p-3">
        <p className="font-semibold text-zinc-900">{exhibition.title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        <p className="mt-1 text-xs text-zinc-400">{t("exhibition.myExhibitions")}</p>
      </div>
    </Link>
  );
}
