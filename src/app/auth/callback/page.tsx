"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Supabase client with detectSessionInUrl: true processes hash/query on load.
    // Brief delay to allow session exchange, then redirect.
    const t = setTimeout(() => {
      router.replace("/");
    }, 500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-zinc-600">Signing you in...</p>
    </div>
  );
}
