"use client";

import { useEffect } from "react";

const BUILD_STAMP = process.env.NEXT_PUBLIC_BUILD_STAMP ?? "local";

export function BuildStamp() {
  useEffect(() => {
    if (typeof console !== "undefined" && console.info) {
      console.info(`BUILD_STAMP=${BUILD_STAMP}`);
    }
  }, []);
  return (
    <span className="text-[10px] text-zinc-400" title={`Build: ${BUILD_STAMP}`}>
      {BUILD_STAMP === "local" ? "local" : `Build: ${BUILD_STAMP}`}
    </span>
  );
}
