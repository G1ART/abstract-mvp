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
      <NewExhibitionFormShell showHeader={false} showCancelLink={false} />
    </Suspense>
  );
}

function UploadExhibitionFallback() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <div className="mb-6 h-3 w-2/3 max-w-md animate-pulse rounded bg-zinc-100" />
      <div className="h-10 w-full animate-pulse rounded bg-zinc-100" />
      <div className="h-10 w-full animate-pulse rounded bg-zinc-100" />
      <div className="h-10 w-full animate-pulse rounded bg-zinc-100" />
    </div>
  );
}
