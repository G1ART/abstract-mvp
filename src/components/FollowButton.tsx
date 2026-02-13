"use client";

import { useCallback, useEffect, useState } from "react";
import { follow, unfollow } from "@/lib/supabase/follows";

type Props = {
  targetProfileId: string;
  initialFollowing: boolean;
  size?: "sm" | "md";
};

function getIsTouch(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(hover: none)").matches ||
    "ontouchstart" in window
  );
}

export function FollowButton({
  targetProfileId,
  initialFollowing,
  size = "md",
}: Props) {
  const [isFollowing, setIsFollowing] = useState(initialFollowing);
  const [hovered, setHovered] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(getIsTouch());
  }, []);

  useEffect(() => {
    setIsFollowing(initialFollowing);
  }, [initialFollowing]);

  const handleClick = useCallback(async () => {
    if (!isFollowing) {
      setIsFollowing(true);
      const { error } = await follow(targetProfileId);
      if (error) setIsFollowing(false);
      return;
    }

    // isFollowing === true
    if (isTouch) {
      if (window.confirm("Unfollow?")) {
        setIsFollowing(false);
        await unfollow(targetProfileId);
      }
      return;
    }

    // Desktop: only confirm when hovered (label is "Unfollow")
    if (hovered) {
      if (window.confirm("Unfollow?")) {
        setIsFollowing(false);
        await unfollow(targetProfileId);
      }
    }
  }, [isFollowing, isTouch, hovered, targetProfileId]);

  const label =
    !isFollowing
      ? "Follow"
      : isTouch
        ? "Following"
        : hovered
          ? "Unfollow"
          : "Following";

  const isUnfollowWarning = isFollowing && !isTouch && hovered;

  const sizeClasses = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => !isTouch && setHovered(true)}
      onMouseLeave={() => !isTouch && setHovered(false)}
      className={`rounded font-medium ${sizeClasses} ${
        isUnfollowWarning
          ? "border border-red-500 bg-transparent text-red-600 hover:bg-red-50"
          : "border border-zinc-300 bg-zinc-900 text-white hover:bg-zinc-800"
      }`}
    >
      {label}
    </button>
  );
}
