"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSession } from "@/lib/supabase/auth";
import { HAS_PASSWORD_KEY } from "@/lib/supabase/auth";
import { getMyProfile } from "@/lib/supabase/profiles";
import { useT } from "@/lib/i18n/useT";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useT();
  const [ready, setReady] = useState(false);

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
      // Enforce set-password for users who have not set a password (e.g. OTP sign-in).
      if (pathname !== "/set-password" && typeof window !== "undefined") {
        if (window.localStorage.getItem(HAS_PASSWORD_KEY) !== "true") {
          router.replace("/set-password");
          return;
        }
      }
      setReady(true);
    });
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
