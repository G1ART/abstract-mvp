"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSession, signOut } from "@/lib/supabase/auth";

export function Header() {
  const router = useRouter();
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
              Feed
            </Link>
            <Link
              href="/me"
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              Me
            </Link>
            <Link
              href="/upload"
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              Upload
            </Link>
            <Link
              href="/artists"
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              Artists
            </Link>
            <Link
              href="/settings"
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              Settings
            </Link>
          </nav>
        )}
      </div>
      <div>
        {hasSession === true ? (
          <button
            type="button"
            onClick={handleLogout}
            className="rounded px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            Logout
          </button>
        ) : hasSession === false ? (
          <Link
            href="/login"
            className="rounded px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            Login
          </Link>
        ) : null}
      </div>
    </header>
  );
}
