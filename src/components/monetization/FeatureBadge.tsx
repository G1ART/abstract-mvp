"use client";

import type { EntitlementDecision } from "@/lib/entitlements";

type Props = {
  decision: EntitlementDecision | null;
  /** When true, forces the badge to render even in the beta_granted
   *  state. Useful on the /dev/entitlements diagnostic page. */
  showInBeta?: boolean;
  className?: string;
};

const LABELS: Record<EntitlementDecision["uiState"], string> = {
  available: "Available",
  soft_locked: "Pro",
  beta_granted: "Beta",
  near_limit: "Near limit",
  blocked: "Locked",
};

const TONES: Record<EntitlementDecision["uiState"], string> = {
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  soft_locked: "bg-amber-50 text-amber-800 border-amber-200",
  beta_granted: "bg-indigo-50 text-indigo-700 border-indigo-200",
  near_limit: "bg-orange-50 text-orange-700 border-orange-200",
  blocked: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

/**
 * Small inline badge communicating the current gating state for a feature.
 * During beta we only surface it when `showInBeta` is set (devtool mode)
 * so the UI doesn't look like it's advertising paid features that are
 * in fact unlocked.
 */
export function FeatureBadge({ decision, showInBeta = false, className = "" }: Props) {
  if (!decision) return null;
  if (decision.uiState === "beta_granted" && !showInBeta) return null;
  if (decision.uiState === "available" && !showInBeta) return null;
  const tone = TONES[decision.uiState];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone} ${className}`.trim()}
    >
      {LABELS[decision.uiState]}
    </span>
  );
}
