"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SectionFrame } from "@/components/ds/SectionFrame";
import { SectionTitle } from "@/components/ds/SectionTitle";
import { Chip } from "@/components/ds/Chip";
import { useT } from "@/lib/i18n/useT";
import { aiApi } from "@/lib/ai/browser";
import { getPeopleRecommendations } from "@/lib/supabase/recommendations";
import { formatIdentityPair } from "@/lib/identity/format";
import { logBetaEvent } from "@/lib/beta/logEvent";
import type { PeopleRec } from "@/lib/supabase/peopleRecs";
import type { MatchmakerRationalesResult } from "@/lib/ai/types";

type Props = {
  me: {
    themes?: string[] | null;
    mediums?: string[] | null;
    city?: string | null;
  };
};

export function MatchmakerCard({ me }: Props) {
  const { t } = useT();
  const [loading, setLoading] = useState(false);
  const [peers, setPeers] = useState<PeopleRec[]>([]);
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [degradedReason, setDegradedReason] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const trigger = useCallback(async () => {
    setLoading(true);
    setDegradedReason(null);
    try {
      const { data } = await getPeopleRecommendations({
        lane: "likes_based",
        limit: 5,
      });
      const top = (data ?? []).slice(0, 5);
      setPeers(top);

      if (top.length === 0) {
        setHasLoaded(true);
        return;
      }

      const candidates = top.map((p) => ({
        profileId: p.id,
        display_name: p.display_name,
        role: p.main_role,
        sharedSignals: p.reason_tags ?? [],
      }));
      const res = await aiApi.matchmakerRationales({
        matchmaker: { me, candidates },
      });
      if (res.degraded) {
        setDegradedReason(res.reason ?? "error");
      }
      const map: Record<string, string> = {};
      for (const r of res.rationales ?? []) {
        if (r?.profileId && r.rationale) map[r.profileId] = r.rationale;
      }
      setRationales(map);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [me]);

  useEffect(() => {
    // Lazy auto-load on first mount; users still see a refresh button.
    void trigger();
  }, [trigger]);

  const errorKey =
    degradedReason === "cap"
      ? "ai.error.softCap"
      : degradedReason === "no_key"
        ? "ai.error.unavailable"
        : degradedReason
          ? "ai.error.tryLater"
          : null;

  return (
    <SectionFrame padding="md" noMargin>
      <SectionTitle
        eyebrow={t("ai.matchmaker.card.title")}
        action={
          <button
            type="button"
            onClick={() => void trigger()}
            disabled={loading}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-500 disabled:opacity-60"
            title={t("ai.disclosure.tooltip")}
          >
            {loading ? t("ai.state.loading") : t("ai.matchmaker.cta")}
          </button>
        }
      >
        {t("ai.matchmaker.card.subtitle")}
      </SectionTitle>

      {hasLoaded && peers.length === 0 && (
        <p className="text-xs text-zinc-500">{t("ai.matchmaker.empty")}</p>
      )}

      {errorKey && <p className="text-xs text-amber-700">{t(errorKey)}</p>}

      {peers.length > 0 && (
        <ul className="flex flex-col gap-2">
          {peers.map((p) => {
            const identity = formatIdentityPair({
              display_name: p.display_name,
              username: p.username,
            });
            const rationale = rationales[p.id] || t("ai.matchmaker.rationaleFallback");
            const href = p.username ? `/u/${p.username}` : `/u/${p.id}`;
            return (
              <li
                key={p.id}
                className="rounded-xl border border-zinc-200 bg-white p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={href}
                      onClick={() =>
                        void logBetaEvent("ai_accepted", {
                          feature: "matchmaker_rationales",
                          profileId: p.id,
                        })
                      }
                      className="truncate text-sm font-medium text-zinc-900 hover:underline"
                    >
                      {identity.primary}
                    </Link>
                    {identity.secondary && (
                      <p className="truncate text-[11px] text-zinc-500">
                        {identity.secondary}
                      </p>
                    )}
                  </div>
                  {p.main_role && <Chip tone="muted">{p.main_role}</Chip>}
                </div>
                <p className="mt-2 text-xs text-zinc-600">{rationale}</p>
              </li>
            );
          })}
        </ul>
      )}
    </SectionFrame>
  );
}
