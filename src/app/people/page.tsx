import { Suspense } from "react";
import { PeopleClient } from "./PeopleClient";

// Suspense boundary fallback. Server-rendered, so we cannot reach the
// `useT` hook here — instead we render a textless skeleton that reads
// the same in any locale and lines up with the salon-tone shell of
// `PeopleClient` (kicker bar + title row + search field + lane chips
// + a pair of card placeholders). This removes the previous "Loading…"
// English literal from the KO experience.
function PeopleShellSkeleton() {
  return (
    <main
      aria-hidden="true"
      className="mx-auto max-w-3xl px-6 py-10 lg:py-14"
    >
      <header className="mb-8">
        <div className="flex items-center gap-2.5">
          <span className="h-3 w-[2px] bg-zinc-300" />
          <span className="h-2 w-16 rounded bg-zinc-200" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="h-7 w-28 rounded bg-zinc-200" />
        </div>
      </header>
      <div className="mb-8 h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50" />
      <div className="mb-6 flex flex-wrap gap-2">
        <span className="h-9 w-32 rounded-full bg-zinc-200" />
        <span className="h-9 w-32 rounded-full bg-zinc-100" />
        <span className="h-9 w-32 rounded-full bg-zinc-100" />
      </div>
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5"
          >
            <div className="h-14 w-14 shrink-0 rounded-full bg-zinc-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-1/3 rounded bg-zinc-200" />
              <div className="h-2.5 w-1/4 rounded bg-zinc-100" />
              <div className="h-2.5 w-2/3 rounded bg-zinc-100" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

export default function PeoplePage() {
  return (
    <Suspense fallback={<PeopleShellSkeleton />}>
      <PeopleClient />
    </Suspense>
  );
}
