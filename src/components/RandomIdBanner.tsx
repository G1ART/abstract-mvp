"use client";

/**
 * Top-of-page banner for placeholder-username users.
 * Non-dismissable: AuthGate provides the hard redirect, but this banner
 * acts as a persistent, visible call-to-action even on pages that load
 * before the gate fires.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyProfile } from "@/lib/supabase/profiles";
import { useT } from "@/lib/i18n/useT";
import { isPlaceholderUsername } from "@/lib/identity/placeholder";
import { IDENTITY_FINISH_PATH } from "@/lib/identity/routing";

export function RandomIdBanner() {
  const { t } = useT();
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user?.id) {
        setShow(false);
        return;
      }
      getMyProfile().then(({ data }) => {
        if (cancelled) return;
        const profile = data as { username?: string | null; display_name?: string | null; roles?: string[] | null } | null;
        const username = profile?.username ?? null;
        const displayName = profile?.display_name ?? null;
        const roles = profile?.roles ?? null;
        // Show banner when username is null/empty, placeholder, or identity is incomplete
        const needsSetup =
          !username ||
          isPlaceholderUsername(username) ||
          !displayName?.trim() ||
          !roles?.length;
        setShow(needsSetup);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  if (!show) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 border-b-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
        <span className="font-semibold text-amber-900">
          {t("banner.identityFinish.title")}
        </span>
        <span className="text-amber-800">{t("banner.identityFinish.cta")}</span>
      </div>
      <Link
        href={IDENTITY_FINISH_PATH}
        className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
      >
        {t("banner.identityFinish.link")} →
      </Link>
    </div>
  );
}
