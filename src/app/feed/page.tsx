"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { FeedContent } from "@/components/FeedContent";

export default function FeedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") ?? "all") as "all" | "following";
  const sort = searchParams.get("sort") ?? "latest";

  function setTab(newTab: "all" | "following") {
    router.push(`/feed?tab=${newTab}&sort=${sort}`);
  }

  function setSort(newSort: "latest" | "popular") {
    router.push(`/feed?tab=${tab}&sort=${newSort}`);
  }

  const sortValue = (sort === "popular" ? "popular" : "latest") as "latest" | "popular";

  return (
    <AuthGate>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex gap-4 border-b border-zinc-200 pb-2">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`text-sm font-medium ${
              tab === "all" ? "text-zinc-900 underline" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setTab("following")}
            className={`text-sm font-medium ${
              tab === "following" ? "text-zinc-900 underline" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Following
          </button>
        </div>
        <div className="mb-4 flex gap-4 text-sm">
          <button
            type="button"
            onClick={() => setSort("latest")}
            className={
              sortValue === "latest"
                ? "font-medium text-zinc-900 underline"
                : "text-zinc-500 hover:text-zinc-700"
            }
          >
            Latest
          </button>
          <button
            type="button"
            onClick={() => setSort("popular")}
            className={
              sortValue === "popular"
                ? "font-medium text-zinc-900 underline"
                : "text-zinc-500 hover:text-zinc-700"
            }
          >
            Popular
          </button>
        </div>
        <FeedContent tab={tab} sort={sortValue} />
      </main>
    </AuthGate>
  );
}
