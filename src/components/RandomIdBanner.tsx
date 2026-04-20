"use client";

/**
 * Top-of-page banner that nudges placeholder-username users to finish
 * identity setup (Onboarding Identity Overhaul, Track I).
 *
 * The server-authoritative routing gate already forces the user to
 * `/onboarding/identity` on their next navigation; this banner is a
 * soft in-session reminder for as long as we still render shell UI.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyProfile } from "@/lib/supabase/profiles";
import { useT } from "@/lib/i18n/useT";
import { isPlaceholderUsername } from "@/lib/identity/placeholder";
import { IDENTITY_FINISH_PATH } from "@/lib/identity/routing";

const DISMISS_KEY = "ab_random_id_banner_dismissed";

export function RandomIdBanner() {
  const { t } = useT();
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") {
      setShow(false);
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user?.id) {
        setShow(false);
        return;
      }
      getMyProfile().then(({ data }) => {
        if (cancelled) return;
        const username = (data as { username?: string | null } | null)?.username ?? null;
        setShow(isPlaceholderUsername(username));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="banner"
      className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-900"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="font-medium">{t("banner.identityFinish.title")}</span>
        <span className="text-zinc-700">{t("banner.identityFinish.cta")}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={IDENTITY_FINISH_PATH}
          className="rounded bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800"
        >
          {t("banner.identityFinish.link")}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-200"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
