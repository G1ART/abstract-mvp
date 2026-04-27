"use client";

/**
 * QA P0.5-E (rows 33, 34): Private-profile fallback that ALSO supports
 * the profile owner previewing their own page.
 *
 * Why a client shell?
 *   The /u/[username] page is a React Server Component. The current
 *   browser-only Supabase client (`src/lib/supabase/client.ts`) does
 *   not surface a session in SSR, so `getMyProfileAsPublic()` always
 *   returns null inside the RSC. That causes owners of private
 *   profiles to see the generic "비공개" message even when they want
 *   to preview their own page (and is the cause of QA row 34: the
 *   "공개 프로필 미리보기" button on /my landing on a dead-end screen).
 *
 * What this component does:
 *   - Receives only the URL `username` param.
 *   - On mount, asks the client-side Supabase for the signed-in
 *     profile and checks whether the username matches the URL.
 *   - If it matches: lazily loads the same artworks / exhibitions
 *     payload the RSC would, and hands everything off to
 *     <UserProfileContent /> exactly like the public branch — so
 *     the rest of the profile UX (tabs, reorder, guides) is shared.
 *   - If it does NOT match (visitor): shows the unchanged "private
 *     profile" message but with a sensible escape hatch (row 33:
 *     a link to "내 스튜디오로 돌아가기" so the user is not parked
 *     on a dead end).
 *
 * Data is fetched client-side ONLY when the visitor turns out to be
 * the owner, so visitors of someone else's private profile pay no
 * extra network cost.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import { UserProfileContent } from "@/components/UserProfileContent";
import {
  getMyProfileAsPublic,
  type ProfilePublic,
} from "@/lib/supabase/profiles";
import {
  listPublicArtworksByArtistId,
  listPublicArtworksListedByProfileId,
  getProfileArtworkOrders,
  applyProfileOrdering,
} from "@/lib/supabase/artworks";
import {
  listExhibitionsForProfile,
  getProfileExhibitionOrders,
  type ExhibitionWithCredits,
} from "@/lib/supabase/exhibitions";

type LoadState = "checking" | "owner" | "stranger" | "error";

function normalizeUsername(u: string | null): string {
  return (u ?? "").trim().toLowerCase();
}

type Props = {
  paramUsername: string;
  initialReorderMode: boolean;
  initialTabParam: string | null;
};

export function PrivateProfileShell({
  paramUsername,
  initialReorderMode,
  initialTabParam,
}: Props) {
  const { t } = useT();
  const [state, setState] = useState<LoadState>("checking");
  const [profile, setProfile] = useState<ProfilePublic | null>(null);
  const [artworks, setArtworks] = useState<
    Awaited<ReturnType<typeof listPublicArtworksByArtistId>>["data"] | null
  >(null);
  const [exhibitions, setExhibitions] = useState<ExhibitionWithCredits[] | null>(
    null
  );
  const [exhibitionOrderEntries, setExhibitionOrderEntries] = useState<
    [string, number][]
  >([]);

  const target = useMemo(() => normalizeUsername(paramUsername), [paramUsername]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: me } = await getMyProfileAsPublic();
      if (cancelled) return;
      if (!me || normalizeUsername(me.username) !== target) {
        setState("stranger");
        return;
      }
      setProfile(me);

      try {
        const [
          { data: artworksAsArtist },
          { data: artworksAsLister },
          { data: exhibitionsRaw },
        ] = await Promise.all([
          listPublicArtworksByArtistId(me.id, { limit: 50 }),
          listPublicArtworksListedByProfileId(me.id, { limit: 50 }),
          listExhibitionsForProfile(me.id),
        ]);
        if (cancelled) return;

        const seen = new Set<string>();
        const merged: NonNullable<typeof artworksAsArtist> = [];
        for (const a of artworksAsArtist ?? []) {
          if (!seen.has(a.id)) {
            seen.add(a.id);
            merged.push(a);
          }
        }
        for (const a of artworksAsLister ?? []) {
          if (!seen.has(a.id)) {
            seen.add(a.id);
            merged.push(a);
          }
        }

        const ids = merged.map((a) => a.id);
        const { data: orderMap } = await getProfileArtworkOrders(me.id, ids);
        const ordered = applyProfileOrdering(merged, orderMap ?? new Map());
        const ex = (exhibitionsRaw ?? []) as ExhibitionWithCredits[];
        const exOrder = await getProfileExhibitionOrders(
          me.id,
          ex.map((e) => e.id)
        );

        if (cancelled) return;
        setArtworks(ordered ?? []);
        setExhibitions(ex);
        setExhibitionOrderEntries(
          Array.from((exOrder.data ?? new Map<string, number>()).entries())
        );
        setState("owner");
      } catch {
        if (cancelled) return;
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  if (state === "checking") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-zinc-500">{t("common.loading")}</p>
      </main>
    );
  }

  if (state === "owner" && profile && artworks && exhibitions) {
    return (
      <UserProfileContent
        profile={profile}
        artworks={artworks}
        exhibitions={exhibitions}
        exhibitionOrderEntries={exhibitionOrderEntries}
        initialReorderMode={initialReorderMode}
        initialTabParam={initialTabParam}
      />
    );
  }

  // QA P0.5-E (row 33): even non-owners deserve an escape hatch from
  // the private-profile dead-end. We deliberately do NOT advertise a
  // login link here — that would be a phishing footgun for an
  // unrelated visitor who lands on a private URL.
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-3">
      <p className="text-zinc-600">{t("profile.private")}</p>
      <p className="text-sm">
        <Link
          href="/my"
          className="text-zinc-700 underline hover:text-zinc-900"
        >
          {t("profile.privateBackToMy")}
        </Link>
      </p>
    </main>
  );
}
