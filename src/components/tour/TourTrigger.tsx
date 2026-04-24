"use client";

/**
 * TourTrigger — invisible component that requests an auto-start for the
 * given tour on first page visit (or after a version bump).
 *
 * Mount this once per tour-enabled page. It has no UI of its own; the
 * actual overlay is rendered by the root `TourProvider`.
 */

import { useEffect } from "react";
import { useTourController } from "./TourProvider";

export function TourTrigger({ tourId }: { tourId: string }) {
  const { requestAutoStart } = useTourController();
  useEffect(() => {
    requestAutoStart(tourId);
  }, [tourId, requestAutoStart]);
  return null;
}
