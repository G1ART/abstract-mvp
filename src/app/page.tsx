"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/supabase/auth";
import { HAS_PASSWORD_KEY } from "@/lib/supabase/auth";
import { getMyProfile } from "@/lib/supabase/profiles";
import { useT } from "@/lib/i18n/useT";

export default function Home() {
  const router = useRouter();
  const { t } = useT();

  useEffect(() => {
    getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await getMyProfile();
      if (!profile) {
        router.replace("/onboarding");
        return;
      }
      if (typeof window !== "undefined" && window.localStorage.getItem(HAS_PASSWORD_KEY) !== "true") {
        router.replace("/set-password");
        return;
      }
      router.replace("/feed?tab=all&sort=latest");
    });
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <p className="text-lg font-semibold text-zinc-900">Abstract</p>
      <p className="text-zinc-600">{t("common.loading")}</p>
    </div>
  );
}
