"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * Global auth state listener. On SIGNED_IN/SIGNED_OUT/TOKEN_REFRESHED:
 * - Clears profile caches (via router refresh so pages re-fetch)
 * - On SIGNED_OUT redirects to /login
 * Prevents stale session / wrong-user-id after account switch.
 */
export function AuthBootstrap() {
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login");
        router.refresh();
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        router.refresh();
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [router]);

  return null;
}
