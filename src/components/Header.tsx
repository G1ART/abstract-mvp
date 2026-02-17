"use client";

import Link from "next/link";
import { BuildStamp } from "./BuildStamp";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { signOut } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";
import { getMyProfile } from "@/lib/supabase/profiles";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";
import { useT } from "@/lib/i18n/useT";

const MAIN_NAV = [
  { href: "/feed?tab=all&sort=latest", key: "nav.feed" },
  { href: "/people", key: "nav.people" },
  { href: "/upload", key: "nav.upload" },
] as const;

const linkClass = "text-sm text-zinc-600 hover:text-zinc-900";

export function Header() {
  const router = useRouter();
  const { t, locale, setLocale } = useT();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

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
      setProfileLoaded(false);
      setAvatarUrl(null);
      return;
    }
    setProfileLoaded(false);
    getMyProfile().then(({ data }) => {
      const p = data as { username?: string | null; avatar_url?: string | null } | null;
      setProfileUsername(p?.username ?? null);
      setAvatarUrl(p?.avatar_url ?? null);
      setProfileLoaded(true);
    });
  }, [session?.user?.id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function closeMobile() {
    setMobileOpen(false);
  }

  async function handleLogout() {
    setAvatarOpen(false);
    await signOut();
    router.replace("/login");
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

        {/* Main tabs: Feed, People, Upload (no Settings) */}
        {ready && loggedIn && (
          <nav className="hidden md:flex items-center gap-4">
            {MAIN_NAV.map(({ href, key }) => (
              <Link key={key} href={href} className={linkClass}>
                {t(key)}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* My Profile | EN/KR | Avatar */}
        {ready && loggedIn && (
          <>
            <Link href={profileUsername ? "/my" : "/onboarding"} className={linkClass}>
              {!profileLoaded ? t("nav.myProfile") : profileUsername ? t("nav.myProfile") : t("people.completeProfile")}
            </Link>
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
            <div className="relative" ref={avatarRef}>
              <button
                type="button"
                onClick={() => setAvatarOpen((o) => !o)}
                className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 hover:bg-zinc-200"
                aria-expanded={avatarOpen}
                aria-haspopup="true"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl.startsWith("http") ? avatarUrl : getArtworkImageUrl(avatarUrl, "avatar")}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-medium text-zinc-600">
                    {(profileUsername ?? "?").charAt(0).toUpperCase()}
                  </span>
                )}
              </button>
              {avatarOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                  <div className="px-4 py-2 text-[10px] text-zinc-400">
                    <BuildStamp />
                  </div>
                  <div className="my-1 border-t border-zinc-100" />
                  <Link
                    href="/settings"
                    className="block px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setAvatarOpen(false)}
                  >
                    {t("account.settings")}
                  </Link>
                  <div className="my-1 border-t border-zinc-100" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    {t("account.logout")}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        {ready && !loggedIn && (
          <>
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
            <Link
              href="/login"
              className="rounded px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              {t("nav.login")}
            </Link>
          </>
        )}

        {/* Mobile: hamburger */}
        <div className="md:hidden flex items-center gap-2">
          {ready && loggedIn && (
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
          )}
        </div>
      </div>

      {/* Mobile menu: Feed, People, Upload, My Profile, Avatar (Settings/Logout inside avatar) */}
      {mobileOpen && loggedIn && (
        <div className="md:hidden absolute top-full left-0 right-0 z-50 border-b border-zinc-200 bg-white shadow-sm">
          <nav className="flex flex-col p-4 gap-1">
            {MAIN_NAV.map(({ href, key }) => (
              <Link key={key} href={href} className={`${linkClass} py-2 px-1`} onClick={closeMobile}>
                {t(key)}
              </Link>
            ))}
            <Link
              href={profileUsername ? "/my" : "/onboarding"}
              className={`${linkClass} py-2 px-1`}
              onClick={closeMobile}
            >
              {!profileLoaded ? t("nav.myProfile") : profileUsername ? t("nav.myProfile") : t("people.completeProfile")}
            </Link>
            <div className="my-2 border-t border-zinc-100" />
            <Link
              href="/settings"
              className={`${linkClass} py-2 px-1`}
              onClick={closeMobile}
            >
              {t("account.settings")}
            </Link>
            <button
              type="button"
              onClick={() => { closeMobile(); handleLogout(); }}
              className="text-left py-2 px-1 text-sm text-red-600 hover:text-red-700"
            >
              {t("account.logout")}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
