"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { getMyProfile } from "@/lib/supabase/profiles";
import { useT } from "@/lib/i18n/useT";

const NAV_LINKS = [
  { href: "/feed?tab=all&sort=latest", key: "nav.feed" },
  { href: "/people", key: "nav.people" },
  { href: "/upload", key: "nav.upload" },
  { href: "/settings", key: "nav.settings" },
] as const;


const linkClass = "text-sm text-zinc-600 hover:text-zinc-900";

export function Header() {
  const { t, locale, setLocale } = useT();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setProfileUsername(null);
      return;
    }
    getMyProfile().then(({ data }) => {
      const p = data as { username?: string | null } | null;
      setProfileUsername(p?.username ?? null);
    });
  }, [session?.user?.id]);

  function closeMobile() {
    setMobileOpen(false);
  }

  const loggedIn = !!session;

  return (
    <header className="relative flex h-14 items-center justify-between border-b border-zinc-200 px-4">
      <div className="flex items-center gap-6">
        <Link
          href="/feed?tab=all&sort=latest"
          className="text-lg font-semibold text-zinc-900 hover:text-zinc-700"
          onClick={closeMobile}
        >
          Abstract
        </Link>

        {/* Desktop nav - no Profile link, My Profile is the hub */}
        {ready && loggedIn && (
          <nav className="hidden md:flex items-center gap-4">
            {NAV_LINKS.map(({ href, key }) => (
              <Link key={key} href={href} className={linkClass}>
                {t(key)}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* My Profile or Complete profile - single entry */}
        {ready && loggedIn && (
          <Link href={profileUsername ? "/my" : "/onboarding"} className={linkClass}>
            {profileUsername ? t("nav.myProfile") : t("people.completeProfile")}
          </Link>
        )}
        {/* Language toggle - always visible */}
        <span className="flex gap-1 text-xs text-zinc-500">
          <button
            type="button"
            onClick={() => setLocale("en")}
            className={locale === "en" ? "font-medium text-zinc-800" : "hover:text-zinc-700"}
          >
            EN
          </button>
          <span>/</span>
          <button
            type="button"
            onClick={() => setLocale("ko")}
            className={locale === "ko" ? "font-medium text-zinc-800" : "hover:text-zinc-700"}
          >
            KO
          </button>
        </span>

        {/* Desktop: Settings / Login (Logout moved to Settings) */}
        {ready && (
          <div className="hidden md:block">
            {loggedIn ? (
              <Link
                href="/settings"
                className="rounded px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                {t("nav.settings")}
              </Link>
            ) : (
              <Link
                href="/login"
                className="rounded px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                {t("nav.login")}
              </Link>
            )}
          </div>
        )}

        {/* Mobile: hamburger or Login */}
        <div className="md:hidden flex items-center gap-2">
          {ready && loggedIn ? (
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              className="rounded p-2 text-zinc-600 hover:bg-zinc-100"
              aria-expanded={mobileOpen}
              aria-label="Menu"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          ) : ready && !loggedIn ? (
            <Link
              href="/login"
              className="rounded px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              {t("nav.login")}
            </Link>
          ) : null}
        </div>
      </div>

      {/* Mobile menu panel - My Profile or Complete profile (one only), no duplication */}
      {mobileOpen && loggedIn && (
        <div className="md:hidden absolute top-full left-0 right-0 z-50 border-b border-zinc-200 bg-white shadow-sm">
          <nav className="flex flex-col p-4 gap-1">
            <Link
              href={profileUsername ? "/my" : "/onboarding"}
              className={`${linkClass} py-2 px-1`}
              onClick={closeMobile}
            >
              {profileUsername ? t("nav.myProfile") : t("people.completeProfile")}
            </Link>
            {NAV_LINKS.map(({ href, key }) => (
              <Link
                key={key}
                href={href}
                className={`${linkClass} py-2 px-1`}
                onClick={closeMobile}
              >
                {t(key)}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
