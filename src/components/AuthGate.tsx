"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSession } from "@/lib/supabase/auth";
import { HAS_PASSWORD_KEY } from "@/lib/supabase/auth";
import { getMyProfile } from "@/lib/supabase/profiles";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-600">Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
}
