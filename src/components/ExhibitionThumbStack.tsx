"use client";

import Image from "next/image";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";

type Props = {
  paths?: string[] | null;
  className?: string;
};

export function ExhibitionThumbStack({ paths, className = "" }: Props) {
  const list = (paths ?? []).filter(Boolean).slice(0, 3);
  if (list.length === 0) {
    return (
      <div className={`flex aspect-[4/3] items-center justify-center rounded-lg bg-zinc-100 text-zinc-400 ${className}`}>
        <span className="text-3xl" aria-hidden>
          🖼
        </span>
      </div>
    );
  }
  return (
    <div className={`relative aspect-[4/3] ${className}`}>
      {list.map((p, idx) => (
        <div
          key={`${p}-${idx}`}
          className="absolute top-0 overflow-hidden rounded-lg border border-white shadow-sm"
          style={{
            left: `${idx * 10}px`,
            right: `${(list.length - idx - 1) * 8}px`,
            zIndex: idx + 1,
            bottom: `${idx * 2}px`,
          }}
        >
          <Image
            src={getArtworkImageUrl(p, "thumb")}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 280px"
          />
        </div>
      ))}
    </div>
  );
}
