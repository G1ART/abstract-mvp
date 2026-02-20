"use client";

import Image from "next/image";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";

type Props = {
  paths?: string[] | null;
  className?: string;
  ratio?: "square" | "landscape";
  imageVariant?: "thumb" | "medium" | "original";
};

export function ExhibitionThumbStack({
  paths,
  className = "",
  ratio = "landscape",
  imageVariant = "medium",
}: Props) {
  const list = (paths ?? []).filter(Boolean).slice(0, 3);
  const ratioClass = ratio === "square" ? "aspect-square" : "aspect-[4/3]";
  if (list.length === 0) {
    return (
      <div className={`flex ${ratioClass} items-center justify-center rounded-lg bg-zinc-100 text-zinc-400 ${className}`}>
        <span className="text-3xl" aria-hidden>
          🖼
        </span>
      </div>
    );
  }
  return (
    <div className={`relative ${ratioClass} ${className}`}>
      {list.map((p, idx) => (
        <div
          key={`${p}-${idx}`}
          className="absolute top-0 overflow-hidden rounded-lg border border-white shadow-sm"
          style={{
            left: `${idx * 8}px`,
            right: `${(list.length - idx - 1) * 6}px`,
            zIndex: idx + 1,
            bottom: `${idx * 2}px`,
          }}
        >
          <Image
            src={getArtworkImageUrl(p, imageVariant)}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 33vw"
          />
        </div>
      ))}
    </div>
  );
}
