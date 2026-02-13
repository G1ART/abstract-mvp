"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/supabase/auth";
import { isFollowing } from "@/lib/supabase/follows";
import { FollowButton } from "./FollowButton";

type Props = {
  profileId: string;
};

export function ProfileActions({ profileId }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [following, setFollowing] = useState<boolean>(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
      if (session?.user?.id && session.user.id !== profileId) {
        isFollowing(profileId).then(({ data }) => setFollowing(data ?? false));
      }
      setReady(true);
    });
  }, [profileId]);

  if (!ready) return null;
  if (!userId) {
    return (
      <Link
        href="/login"
        className="inline-block rounded border border-zinc-300 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
      >
        Login
      </Link>
    );
  }
  if (userId === profileId) return null; // Prevent self-follow

  return (
    <FollowButton
      targetProfileId={profileId}
      initialFollowing={following}
      size="md"
    />
  );
}
