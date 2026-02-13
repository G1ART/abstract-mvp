import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { FeedClient } from "./FeedClient";

export default function FeedPage() {
  return (
    <AuthGate>
      <Suspense
        fallback={
          <main className="mx-auto max-w-4xl px-4 py-6">
            <p className="text-zinc-600">Loading feed...</p>
          </main>
        }
      >
        <FeedClient />
      </Suspense>
    </AuthGate>
  );
}
