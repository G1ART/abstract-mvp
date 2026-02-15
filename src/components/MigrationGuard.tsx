"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { checkSupabaseMigrations } from "@/lib/supabase/migrationGuard";

const STORAGE_KEY = "ab_migration_check_done";
const TTL_MS = 5 * 60 * 1000; // 5 min

function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

function showToast(message: string) {
  const el = document.createElement("div");
  el.setAttribute("role", "alert");
  el.className = "fixed bottom-4 left-4 z-[9999] max-w-md rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 8000);
}

export function MigrationGuard() {
  const didRun = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname === "/settings") return;
    if (didRun.current) return;
    didRun.current = true;

    try {
      const cached = sessionStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as { ts?: number };
        if (parsed?.ts != null && Date.now() - parsed.ts < TTL_MS) return;
      }
    } catch {
      /* ignore parse error */
    }

    checkSupabaseMigrations()
      .then(({ ok, failed }) => {
        if (ok) {
          try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now() }));
          } catch {
            /* ignore */
          }
          return;
        }
        const msg = `Supabase migration not applied: ${failed.join(", ")}`;
        if (isDev()) {
          console.warn("[MigrationGuard]", msg);
          showToast(msg);
        } else {
          console.error("[MigrationGuard]", msg);
        }
      })
      .catch(() => {
        /* never block UI */
      });
  }, [pathname]);

  return null;
}
