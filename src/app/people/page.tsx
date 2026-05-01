import { Suspense } from "react";
import { PageShellSkeleton } from "@/components/ds/PageShellSkeleton";
import { PeopleClient } from "./PeopleClient";

export default function PeoplePage() {
  return (
    <Suspense fallback={<PageShellSkeleton variant="default" />}>
      <PeopleClient />
    </Suspense>
  );
}
