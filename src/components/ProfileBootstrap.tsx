"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
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

/** Skip profile creation on onboarding so the user can set username/display_name first (no random ID). */
function isOnboardingPath(pathname: string | null): boolean {
  return pathname === "/onboarding";
}

function doEnsure(session: { user: { id: string } } | null, pathname: string | null) {
  if (!session?.user?.id) return;
  if (isOnboardingPath(pathname)) return;
  if (getBootstrapDone()) return;

  void (async () => {
    try {
      const { error } = await supabase.rpc("ensure_my_profile");
      if (!error) {
        setBootstrapDone();
        if (process.env.NODE_ENV === "development") {
          console.info("[bootstrap] ensured profile row");
        }
      }
    } catch {
      /* fire-and-forget; swallow */
    }
  })();
}

export function ProfileBootstrap() {
  const pathname = usePathname();

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
      doEnsure(session, pathname);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      doEnsure(session, pathname);
    });

    return () => sub.subscription.unsubscribe();
  }, [pathname]);

  return null;
}
