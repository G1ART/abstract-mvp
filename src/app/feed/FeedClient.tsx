"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/supabase/auth";
import { FeedContent } from "@/components/FeedContent";

export function FeedClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const tab = (searchParams.get("tab") ?? "all") as "all" | "following";
  const sortValue =
    (searchParams.get("sort") === "popular" ? "popular" : "latest") as
      | "latest"
      | "popular";

  useEffect(() => {
    getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
  }, []);

  function handleTabChange(newTab: "all" | "following") {
    router.push(`/feed?tab=${newTab}&sort=${sortValue}`);
  }

  function handleSortChange(newSort: "latest" | "popular") {
    router.push(`/feed?tab=${tab}&sort=${newSort}`);
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:py-8">
      <FeedContent
        tab={tab}
        sort={sortValue}
        userId={userId}
        onTabChange={handleTabChange}
        onSortChange={handleSortChange}
      />
    </main>
  );
}
