"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

const BOOTSTRAP_KEY = "ab_profile_bootstrap_done";

function getBootstrapDone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(BOOTSTRAP_KEY) === "1";
  } catch {
    return false;
  }
}

function setBootstrapDone(): void {
  try {
    sessionStorage.setItem(BOOTSTRAP_KEY, "1");
  } catch {
    /* ignore */
  }
}

function doEnsure(session: { user: { id: string } } | null) {
  if (!session?.user?.id) return;
  if (getBootstrapDone()) return;

  supabase
    .rpc("ensure_my_profile")
    .then(({ error }) => {
      if (!error) {
        setBootstrapDone();
        if (process.env.NODE_ENV === "development") {
          console.info("[bootstrap] ensured profile row");
        }
      }
    })
    .catch(() => {
      /* fire-and-forget; safe catch */
    });
}

export function ProfileBootstrap() {
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user?.id) {
        try {
          sessionStorage.removeItem(BOOTSTRAP_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      doEnsure(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      doEnsure(session);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}
