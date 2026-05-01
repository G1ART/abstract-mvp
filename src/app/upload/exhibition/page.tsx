"use client";

import { Suspense } from "react";
import { NewExhibitionFormShell } from "@/components/exhibitions/NewExhibitionFormShell";

/**
 * "전시 게시물 만들기" tab inside Upload. Renders the canonical new
 * exhibition form INLINE (no redirect) so the upload tab strip stays
 * visible and the user keeps the same page identity while creating an
 * exhibition. Cancel link is hidden because the LaneChips above already
 * provide a way back to the other upload entrypoints.
 *
 * The fallback is a plain skeleton (no `<main>`) because the upload
 * layout already supplies the `PageShell` wrapper.
 */
export default function UploadExhibitionPage() {
  return (
    <Suspense fallback={<UploadExhibitionFallback />}>
      <NewExhibitionFormShell showCancelLink={false} />
    </Suspense>
  );
}

function UploadExhibitionFallback() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <header className="mb-8">
        <span className="block h-7 w-40 animate-pulse rounded bg-zinc-200" />
        <span className="mt-2.5 block h-3 w-2/3 max-w-md animate-pulse rounded bg-zinc-100" />
      </header>
      <div className="h-10 w-full animate-pulse rounded bg-zinc-100" />
      <div className="h-10 w-full animate-pulse rounded bg-zinc-100" />
      <div className="h-10 w-full animate-pulse rounded bg-zinc-100" />
    </div>
  );
}
