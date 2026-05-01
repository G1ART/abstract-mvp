"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/supabase/auth";
import { FeedContent } from "@/components/FeedContent";
import { PageShell } from "@/components/ds/PageShell";

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
    <PageShell variant="feed">
      <FeedContent
        tab={tab}
        sort={sortValue}
        userId={userId}
        onTabChange={handleTabChange}
        onSortChange={handleSortChange}
      />
    </PageShell>
  );
}
