"use client";

/**
 * Private-profile shell — Phase 1 of "Private Account v2" (PR1).
 *
 * This shell renders the screen for visitors who arrive at /u/{username}
 * when the target's `is_public = false`, and also handles two adjacent
 * cases that have specific UX requirements:
 *
 *   1. OWNER PREVIEW (existing behaviour, preserved)
 *      The browser-only Supabase client has no SSR session, so the RSC
 *      cannot tell whether the visitor is actually the profile owner.
 *      On mount we ask the client-side Supabase for the signed-in
 *      profile and, if the username matches, lazily load the same
 *      portfolio data the public branch would and hand off to
 *      <UserProfileContent />. We additionally surface a banner reading
 *      "현재 비공개 계정이에요. … 설정에서 공개 계정으로 전환해 주세요."
 *      so the owner has unambiguous awareness of why their preview looks
 *      empty to other people.
 *
 *   2. VISITOR (Phase 1 upgrade)
 *      Until this PR, visitors saw a flat "비공개입니다" sentence with a
 *      single "내 스튜디오로 돌아가기" link — effectively a dead end. With
 *      Private Account v2 we expose the meta card (avatar / display name
 *      / main role / bio) and a Follow / Requested button that drives the
 *      `request_follow_or_follow` RPC. The principal can then approve or
 *      decline from their notifications inbox.
 *
 *      Sensitive portfolio fields (themes, mediums, statement, cover
 *      image, location, website, exhibitions, awards, studio portfolio)
 *      remain hidden — the SQL RPC `lookup_profile_by_username` returns
 *      a meta-card-only slice for private rows.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import { UserProfileContent } from "@/components/UserProfileContent";
import {
  getMyProfileAsPublic,
  type PrivateProfileCard,
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
import { FollowButton } from "@/components/FollowButton";

type LoadState = "checking" | "owner" | "stranger" | "error";

function normalizeUsername(u: string | null): string {
  return (u ?? "").trim().toLowerCase();
}

type Props = {
  paramUsername: string;
  initialReorderMode: boolean;
  initialTabParam: string | null;
  privateCard: PrivateProfileCard | null;
};

export function PrivateProfileShell({
  paramUsername,
  initialReorderMode,
  initialTabParam,
  privateCard,
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
      <>
        <OwnerPrivateBanner t={t} />
        <UserProfileContent
          profile={profile}
          artworks={artworks}
          exhibitions={exhibitions}
          exhibitionOrderEntries={exhibitionOrderEntries}
          initialReorderMode={initialReorderMode}
          initialTabParam={initialTabParam}
        />
      </>
    );
  }

  // Visitor branch — show meta card + Follow/Request action.
  if (privateCard) {
    return <VisitorPrivateCard t={t} card={privateCard} />;
  }

  // Defensive fallback (should be unreachable now that the SQL returns a
  // meta-card slice). Preserve the legacy dead-end-with-escape-hatch UI
  // just in case the RPC contract drifts.
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

function OwnerPrivateBanner({ t }: { t: (key: string) => string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-4">
      <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 text-amber-700">
            <LockIcon />
          </span>
          <div className="flex-1">
            <p className="font-medium text-amber-900">
              {t("profile.private.ownerNotice.title")}
            </p>
            <p className="mt-1 text-amber-800">
              {t("profile.private.ownerNotice.body")}
            </p>
            <p className="mt-2">
              <Link
                href="/settings"
                className="inline-flex items-center rounded border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                {t("profile.private.ownerNotice.cta")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisitorPrivateCard({
  t,
  card,
}: {
  t: (key: string) => string;
  card: PrivateProfileCard;
}) {
  const initialStatus = card.viewer_follow_status;
  const display = card.display_name?.trim() || card.username || "—";
  const role = card.main_role?.trim() ? card.main_role : null;

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-full bg-zinc-100">
            {card.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.avatar_url}
                alt={display}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-400">
                <UserIcon />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-zinc-900">
                {display}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                <LockIcon className="h-3 w-3" />
                {t("profile.private.lockBadge")}
              </span>
            </div>
            {card.username ? (
              <p className="text-sm text-zinc-500">@{card.username}</p>
            ) : null}
            {role ? (
              <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                {role}
              </p>
            ) : null}
          </div>
        </div>

        {card.bio?.trim() ? (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
            {card.bio}
          </p>
        ) : null}

        <div className="mt-6 rounded border border-zinc-200 bg-zinc-50 px-4 py-3">
          <p className="text-sm font-medium text-zinc-800">
            {t("profile.private.notice.title")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            {t("profile.private.notice.body")}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <FollowButton
            targetProfileId={card.id}
            initialStatus={initialStatus}
            isPrivateTarget
            onFollowed={() => {
              // Accepted is unreachable for a private target on first
              // click — guard kept for symmetry / future RPC changes.
            }}
          />
          {initialStatus === "pending" ? (
            <span className="text-xs text-zinc-500">
              {t("profile.private.requestSent")}
            </span>
          ) : null}
          <Link
            href="/people"
            className="ml-auto text-xs text-zinc-500 underline hover:text-zinc-800"
          >
            {t("profile.privateBackToMy")}
          </Link>
        </div>
      </div>
    </main>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "h-4 w-4"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}
