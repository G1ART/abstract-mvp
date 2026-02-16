"use client";

import { useEffect } from "react";

const BUILD_STAMP = process.env.NEXT_PUBLIC_BUILD_STAMP ?? "";

export function BuildStamp() {
  useEffect(() => {
    if (BUILD_STAMP && typeof console !== "undefined" && console.info) {
      console.info(`BUILD_STAMP=${BUILD_STAMP}`);
    }
  }, []);

  if (!BUILD_STAMP) return null;

  return (
    <span className="text-[10px] text-zinc-400" title={`Build: ${BUILD_STAMP}`}>
      Build: {BUILD_STAMP}
    </span>
  );
}
