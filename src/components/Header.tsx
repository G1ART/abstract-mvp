"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSession, signOut } from "@/lib/supabase/auth";
import { useT } from "@/lib/i18n/useT";

export function Header() {
  const router = useRouter();
  const { t, locale, setLocale } = useT();
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
    });
  }, []);

  async function handleLogout() {
    await signOut();
    router.replace("/login");
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
      <div className="flex items-center gap-6">
        <Link
          href="/feed?tab=all&sort=latest"
          className="text-lg font-semibold text-zinc-900 hover:text-zinc-700"
        >
          Abstract
        </Link>
        {hasSession === true && (
          <nav className="flex gap-4">
            <Link
              href="/feed?tab=all&sort=latest"
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              {t("nav.feed")}
            </Link>
            <Link
              href="/me"
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              {t("nav.me")}
            </Link>
            <Link
              href="/upload"
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              {t("nav.upload")}
            </Link>
            <Link
              href="/artists"
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              {t("nav.artists")}
            </Link>
            <Link
              href="/settings"
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              {t("nav.settings")}
            </Link>
          </nav>
        )}
      </div>
      <div className="flex items-center gap-3">
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
        {hasSession === true ? (
          <button
            type="button"
            onClick={handleLogout}
            className="rounded px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            {t("nav.logout")}
          </button>
        ) : hasSession === false ? (
          <Link
            href="/login"
            className="rounded px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            {t("nav.login")}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
