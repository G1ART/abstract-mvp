"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, getMyAuthState } from "@/lib/supabase/auth";
import { useT } from "@/lib/i18n/useT";
import {
  isRandomUsername,
  RANDOM_USERNAME_PROMPTED_KEY,
} from "@/lib/profile/randomUsername";

/** Only allow relative paths to avoid open redirect. */
function safeNext(next: string | null): string | null {
  if (!next || typeof next !== "string") return null;
  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = safeNext(searchParams.get("next"));
  const { t } = useT();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await getSession();
      if (cancelled) return;
      if (!session) {
        router.replace("/");
        return;
      }
      const state = await getMyAuthState();
      if (cancelled) return;
      if (!state || state.needs_onboarding) {
        router.replace("/onboarding");
        return;
      }
      if (
        typeof window !== "undefined" &&
        isRandomUsername(state.username) &&
        window.sessionStorage.getItem(RANDOM_USERNAME_PROMPTED_KEY) !== "1"
      ) {
        window.sessionStorage.setItem(RANDOM_USERNAME_PROMPTED_KEY, "1");
        const target = nextParam || "/feed?tab=all&sort=latest";
        router.replace(`/username-fix?next=${encodeURIComponent(target)}`);
        return;
      }
      if (!state.has_password) {
        router.replace(nextParam || "/set-password");
        return;
      }
      router.replace(nextParam || "/feed?tab=all&sort=latest");
    })();
    return () => {
      cancelled = true;
    };
  }, [router, nextParam]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-zinc-600">{t("auth.signingIn")}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-zinc-600">Loading...</p>
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
