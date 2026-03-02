"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/supabase/auth";
import { getMyProfile } from "@/lib/supabase/profiles";
import { HAS_PASSWORD_KEY } from "@/lib/supabase/auth";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Supabase processes hash/query on load. Short delay then decide redirect.
    const t = setTimeout(async () => {
      const {
        data: { session },
      } = await getSession();
      if (!session) {
        router.replace("/");
        return;
      }
      const { data: profile } = await getMyProfile();
      if (!profile) {
        router.replace("/onboarding");
        return;
      }
      if (
        typeof window !== "undefined" &&
        window.localStorage.getItem(HAS_PASSWORD_KEY) !== "true"
      ) {
        router.replace("/set-password");
        return;
      }
      router.replace("/feed?tab=all&sort=latest");
    }, 600);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-zinc-600">Signing you in...</p>
    </div>
  );
}
