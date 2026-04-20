"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, getMyAuthState } from "@/lib/supabase/auth";
import { routeByAuthState, safeNextPath } from "@/lib/identity/routing";
import { useT } from "@/lib/i18n/useT";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = safeNextPath(searchParams.get("next"));
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
      const { to } = routeByAuthState(state, { nextPath: nextParam });
      router.replace(to);
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
