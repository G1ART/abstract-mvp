"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { like, unlike } from "@/lib/supabase/likes";

type Props = {
  artworkId: string;
  likesCount: number;
  isLiked: boolean;
  onUpdate?: (newLiked: boolean, newCount: number) => void;
  /** When true, show "Login to like" instead of like button */
  showLoginCta?: boolean;
  size?: "sm" | "md";
};

export function LikeButton({
  artworkId,
  likesCount: initialCount,
  isLiked: initialLiked,
  onUpdate,
  showLoginCta = false,
  size = "md",
}: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (showLoginCta || loading) return;
      const nextLiked = !liked;
      const nextCount = count + (nextLiked ? 1 : -1);
      setLiked(nextLiked);
      setCount(nextCount);
      setLoading(true);
      const { error } = nextLiked
        ? await like(artworkId)
        : await unlike(artworkId);
      setLoading(false);
      if (error) {
        setLiked(liked);
        setCount(count);
        return;
      }
      onUpdate?.(nextLiked, nextCount);
    },
    [artworkId, liked, count, loading, showLoginCta, onUpdate]
  );

  if (showLoginCta) {
    return (
      <Link
        href="/login"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-800 ${
          size === "sm" ? "text-sm" : "text-base"
        }`}
      >
        <span aria-hidden>♡</span>
        <span>{count > 0 ? count : ""}</span>
        <span>Login to like</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 text-zinc-600 hover:text-zinc-900 disabled:opacity-70 ${
        size === "sm" ? "text-sm" : "text-base"
      }`}
    >
      <span aria-hidden>{liked ? "❤️" : "♡"}</span>
      <span>{count > 0 ? count : ""}</span>
    </button>
  );
}
