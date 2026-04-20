"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSession, getMyAuthState } from "@/lib/supabase/auth";
import {
  IDENTITY_FINISH_PATH,
  ONBOARDING_PATH,
  SET_PASSWORD_PATH,
  LOGIN_PATH,
} from "@/lib/identity/routing";
import { useT } from "@/lib/i18n/useT";

/**
 * Client-side gate that guards protected product surfaces. It only
 * redirects when there is a concrete gap (no session, identity
 * incomplete, missing password); otherwise it lets the wrapped page
 * render in place. This keeps URLs like `/feed?tab=all` and
 * `/artwork/123` sticky instead of bouncing them through the router.
 *
 * Precedence (Onboarding Identity Overhaul, Track D):
 *   1. no session            → /login
 *   2. needs_identity_setup  → /onboarding/identity?next=<current>
 *   3. needs_onboarding      → /onboarding
 *   4. !has_password         → /set-password
 */
function currentPathWithQuery(): string | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  const search = window.location.search;
  if (!path) return null;
  return search ? `${path}${search}` : path;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useT();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await getSession();
      if (cancelled) return;
      if (!session) {
        router.replace(LOGIN_PATH);
        return;
      }
      const state = await getMyAuthState();
      if (cancelled) return;
      if (!state) {
        router.replace(LOGIN_PATH);
        return;
      }

      if (state.needs_identity_setup) {
        const next = currentPathWithQuery();
        const isAlreadyFinish =
          pathname === IDENTITY_FINISH_PATH ||
          (pathname?.startsWith(`${IDENTITY_FINISH_PATH}/`) ?? false);
        if (!isAlreadyFinish) {
          const q = next ? `?next=${encodeURIComponent(next)}` : "";
          router.replace(`${IDENTITY_FINISH_PATH}${q}`);
          return;
        }
      } else if (state.needs_onboarding) {
        const isAlreadyOnboarding =
          pathname === ONBOARDING_PATH ||
          (pathname?.startsWith(`${ONBOARDING_PATH}/`) ?? false);
        if (!isAlreadyOnboarding) {
          router.replace(ONBOARDING_PATH);
          return;
        }
      } else if (!state.has_password) {
        if (pathname !== SET_PASSWORD_PATH) {
          router.replace(SET_PASSWORD_PATH);
          return;
        }
      }

      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-lg font-semibold text-zinc-900">Abstract</p>
        <p className="text-zinc-600">{t("common.loading")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
