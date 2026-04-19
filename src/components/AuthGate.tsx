"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSession, getMyAuthState } from "@/lib/supabase/auth";
import { useT } from "@/lib/i18n/useT";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useT();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await getSession();
      if (cancelled) return;
      if (!session) {
        router.replace("/login");
        return;
      }
      const state = await getMyAuthState();
      if (cancelled) return;
      if (!state) {
        router.replace("/login");
        return;
      }
      if (state.needs_onboarding) {
        router.replace("/onboarding");
        return;
      }
      if (!state.has_password && pathname !== "/set-password") {
        router.replace("/set-password");
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-lg font-semibold text-zinc-900">Abstract</p>
        <p className="text-zinc-600">{t("common.loading")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
