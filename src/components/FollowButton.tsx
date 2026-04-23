"use client";

import { useCallback, useEffect, useState } from "react";
import { logBetaEventSync } from "@/lib/beta/logEvent";
import { follow, unfollow } from "@/lib/supabase/follows";

type Props = {
  targetProfileId: string;
  initialFollowing: boolean;
  size?: "sm" | "md";
  /**
   * Fires after the follow insert succeeds. Parents use this to open the
   * Connection Messages intro sheet so users can optionally send a short
   * note — see `/people` PeopleClient. Never fires on unfollow so the
   * unfollow flow keeps its existing behaviour unchanged.
   */
  onFollowed?: () => void;
  /**
   * Opt-in: defer the follow insert to the parent. When provided, clicking
   * the (not-yet-following) button simply calls this handler instead of
   * executing `follow()`. The parent is then responsible for eventually
   * committing the follow (e.g. after a confirmation sheet) and updating
   * `initialFollowing`.
   *
   * Unfollow flow is untouched — hover-to-unfollow still works as before.
   * Pages that don't pass this prop keep the original "click → immediate
   * follow" behaviour.
   */
  interceptFollow?: () => void;
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
  onFollowed,
  interceptFollow,
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
      // Parent wants to intercept (e.g. show a confirmation sheet before
      // committing). We delegate entirely — no optimistic state, no
      // follow() call. Parent will commit follow and bump initialFollowing
      // via its own state (synced by the effect above).
      if (interceptFollow) {
        interceptFollow();
        return;
      }
      setIsFollowing(true);
      const { error } = await follow(targetProfileId);
      if (error) {
        setIsFollowing(false);
      } else {
        logBetaEventSync("profile_followed", { profile_id: targetProfileId });
        onFollowed?.();
      }
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
  }, [isFollowing, isTouch, hovered, targetProfileId, onFollowed, interceptFollow]);

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
