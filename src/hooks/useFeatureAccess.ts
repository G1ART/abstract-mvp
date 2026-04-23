"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActingAs } from "@/context/ActingAsContext";
import { supabase } from "@/lib/supabase/client";
import {
  resolveEntitlementFor,
  type EntitlementDecision,
  type FeatureKey,
} from "@/lib/entitlements";
import { recordUsageEvent } from "@/lib/metering/recordUsageEvent";

export type UseFeatureAccessOptions = {
  /** When set, the resolver includes the given workspace plan in the fold. */
  workspaceId?: string | null;
  /** Skip the usage-events round trip; useful for frequent render paths
   *  that only need a yes/no answer for UI branching. */
  skipQuotaCheck?: boolean;
};

export type UseFeatureAccessResult = {
  decision: EntitlementDecision | null;
  loading: boolean;
  refresh: () => void;
  /** Log a `feature.impression` row for this feature. Idempotent per
   *  render (guards against duplicate renders firing the same event). */
  recordImpression: () => void;
};

/**
 * Client-side façade over the spine resolver. Call it once per gated
 * surface; it auto-refreshes when the acting-as context changes so a
 * delegate switching between principals sees the correct gating instantly.
 *
 * `decision === null` means "still resolving"; UI should render a neutral
 * placeholder rather than a locked state to avoid a flash-of-paywall.
 */
export function useFeatureAccess(
  featureKey: FeatureKey | string,
  opts?: UseFeatureAccessOptions
): UseFeatureAccessResult {
  const { actingAsProfileId } = useActingAs();
  const [decision, setDecision] = useState<EntitlementDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const impressionFired = useRef<string | null>(null);

  const workspaceId = opts?.workspaceId ?? null;
  const skipQuotaCheck = opts?.skipQuotaCheck ?? false;

  const resolve = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;

      // For acting-as, we need the owner's user_id. The profile id in context
      // is already the auth.users.id since our profiles.id == users.id, so
      // we pass it straight through.
      const next = await resolveEntitlementFor({
        featureKey,
        userId,
        actingAsOwnerUserId: actingAsProfileId ?? null,
        workspaceId,
        skipQuotaCheck,
      });
      setDecision(next);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[useFeatureAccess] resolve failed", err);
      }
      setDecision(null);
    } finally {
      setLoading(false);
    }
  }, [featureKey, actingAsProfileId, workspaceId, skipQuotaCheck]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await resolve();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [resolve]);

  const recordImpression = useCallback(() => {
    const fp = `${featureKey}:${actingAsProfileId ?? ""}`;
    if (impressionFired.current === fp) return;
    impressionFired.current = fp;
    void recordUsageEvent(
      {
        key: "feature.impression",
        featureKey,
        metadata: { uiState: decision?.uiState ?? null },
      },
      { dualWriteBeta: false }
    );
  }, [featureKey, actingAsProfileId, decision?.uiState]);

  return useMemo(
    () => ({ decision, loading, refresh: () => void resolve(), recordImpression }),
    [decision, loading, resolve, recordImpression]
  );
}
