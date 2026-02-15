import { Suspense } from "react";
import { PeopleClient } from "./PeopleClient";

export default function PeoplePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl px-4 py-8">
          <p className="text-zinc-600">Loading...</p>
        </main>
      }
    >
      <PeopleClient />
    </Suspense>
  );
}
