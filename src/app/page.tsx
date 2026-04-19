"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession, getMyAuthState } from "@/lib/supabase/auth";
import { useT } from "@/lib/i18n/useT";

export default function Home() {
  const router = useRouter();
  const { t } = useT();

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
      if (!state || state.needs_onboarding) {
        router.replace("/onboarding");
        return;
      }
      if (!state.has_password) {
        router.replace("/set-password");
        return;
      }
      router.replace("/feed?tab=all&sort=latest");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <p className="text-lg font-semibold text-zinc-900">Abstract</p>
      <p className="text-zinc-600">{t("common.loading")}</p>
    </div>
  );
}
