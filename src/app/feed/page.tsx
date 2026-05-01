import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { PageShellSkeleton } from "@/components/ds/PageShellSkeleton";
import { FeedClient } from "./FeedClient";

export default function FeedPage() {
  return (
    <AuthGate>
      <Suspense fallback={<PageShellSkeleton variant="feed" />}>
        <FeedClient />
      </Suspense>
    </AuthGate>
  );
}
