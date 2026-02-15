"use client";

import { useCallback, useEffect } from "react";
import { getSession } from "@/lib/supabase/auth";
import { recordProfileView } from "@/lib/supabase/profileViews";

const PROFILE_VIEW_TTL_MS = 30 * 60 * 1000;

type Props = {
  profileId: string;
};

export function ProfileViewTracker({ profileId }: Props) {
  const record = useCallback(async () => {
    if (!profileId || typeof window === "undefined") return;
    const key = `viewed_profile_${profileId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const ts = parseInt(raw, 10);
      if (!isNaN(ts) && Date.now() - ts < PROFILE_VIEW_TTL_MS) return;
    }
    const { data: { session } } = await getSession();
    if (!session?.user?.id || session.user.id === profileId) return;
    await recordProfileView(profileId);
    localStorage.setItem(key, Date.now().toString());
  }, [profileId]);

  useEffect(() => {
    record();
  }, [record]);

  return null;
}
