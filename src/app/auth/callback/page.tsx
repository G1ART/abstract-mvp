"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession } from "@/lib/supabase/auth";
import { getMyProfile } from "@/lib/supabase/profiles";
import { HAS_PASSWORD_KEY } from "@/lib/supabase/auth";

/** Only allow relative paths to avoid open redirect. */
function safeNext(next: string | null): string | null {
  if (!next || typeof next !== "string") return null;
  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = safeNext(searchParams.get("next"));

  useEffect(() => {
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
        router.replace(nextParam || "/set-password");
        return;
      }
      router.replace(nextParam || "/feed?tab=all&sort=latest");
    }, 600);
    return () => clearTimeout(t);
  }, [router, nextParam]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-zinc-600">Signing you in...</p>
    </div>
  );
}
