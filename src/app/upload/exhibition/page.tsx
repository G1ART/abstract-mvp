"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Upload tab "전시 만들기": redirect to the canonical new exhibition page
 * with from=upload so the back link returns to Upload.
 */
export default function UploadExhibitionPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/my/exhibitions/new?from=upload");
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-zinc-500">
      <p>Redirecting...</p>
    </div>
  );
}
