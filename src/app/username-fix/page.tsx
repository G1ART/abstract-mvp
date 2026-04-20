"use client";

/**
 * Legacy `/username-fix` → now a redirect shim to `/onboarding/identity`.
 *
 * Email links and bookmarks may still point here after the Onboarding
 * Identity Overhaul (Track E). We preserve `next`, drop the legacy
 * sessionStorage flag so the new server-authoritative gate can't be
 * bypassed, and forward.
 */

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/useT";
import {
  IDENTITY_FINISH_PATH,
  safeNextPath,
} from "@/lib/identity/routing";
import { RANDOM_USERNAME_PROMPTED_KEY } from "@/lib/profile/randomUsername";

function UsernameFixInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const { t } = useT();

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(RANDOM_USERNAME_PROMPTED_KEY);
        window.sessionStorage.removeItem("ab_focus_username_field");
        window.sessionStorage.removeItem("ab_username_fix_next_path");
      } catch {
        /* ignore */
      }
    }
    const qs = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    router.replace(`${IDENTITY_FINISH_PATH}${qs}`);
  }, [router, nextPath]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-zinc-600">{t("common.loading")}</p>
    </main>
  );
}

export default function UsernameFixPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-zinc-600">Loading...</p>
        </main>
      }
    >
      <UsernameFixInner />
    </Suspense>
  );
}
