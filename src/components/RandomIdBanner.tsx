"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyProfile } from "@/lib/supabase/profiles";
import { useT } from "@/lib/i18n/useT";
import { isRandomUsername } from "@/lib/profile/randomUsername";

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
        setShow(isRandomUsername(username));
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
      className="flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-900"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="font-medium">{t("banner.randomIdTitle")}</span>
        <span className="text-amber-800">{t("banner.randomIdCta")}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/settings"
          className="rounded bg-amber-200 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-300"
        >
          {t("banner.randomIdLink")}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 text-amber-700 hover:bg-amber-200"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
