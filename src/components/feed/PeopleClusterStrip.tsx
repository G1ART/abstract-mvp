"use client";

import Image from "next/image";
import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import {
  formatIdentityPair,
  formatRoleChips,
} from "@/lib/identity/format";
import { reasonTagToI18n } from "@/lib/people/reason";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";
import type { LivingSalonClusterPersona } from "@/lib/feed/livingSalon";
import type { PeopleRec } from "@/lib/supabase/peopleRecs";
import { FollowButton } from "@/components/FollowButton";

type Props = {
  persona: LivingSalonClusterPersona;
  profiles: PeopleRec[];
  followingIds: Set<string>;
  userId: string | null;
};

const PERSONA_HEADER_KEY: Record<LivingSalonClusterPersona, string> = {
  curator: "feed.curatorClusterHeader",
  gallerist: "feed.galleristClusterHeader",
  collector: "feed.collectorClusterHeader",
};

function getAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  return getArtworkImageUrl(avatarUrl, "avatar");
}

/**
 * Living Salon "people cluster" strip — the LinkedIn "Jobs recommended
 * for you" pattern, reshaped for our salon: a discreet uppercase header
 * over a 1-/2-/3-column card row. Each card carries a single person with
 * an avatar, name, role chip, a one-line reason, and a Follow button
 * (full-width inside the card). The Follow button reuses the existing
 * `<FollowButton>` so the message-draft modal for private accounts works
 * identically to the rest of the app.
 *
 * The builder buckets non-artist personas (curator / gallerist /
 * collector) and emits same-persona clusters of up to 3 profiles, so
 * this component never has to mix personas inside one strip.
 */
export function PeopleClusterStrip({
  persona,
  profiles,
  followingIds,
  userId,
}: Props) {
  const { t } = useT();

  return (
    <section className="border-y border-zinc-100 py-8">
      <p className="mb-5 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
        {t(PERSONA_HEADER_KEY[persona])}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {profiles.map((profile) => (
          <PersonCard
            key={profile.id}
            profile={profile}
            initialFollowing={followingIds.has(profile.id)}
            userId={userId}
          />
        ))}
      </div>
    </section>
  );
}

function PersonCard({
  profile,
  initialFollowing,
  userId,
}: {
  profile: PeopleRec;
  initialFollowing: boolean;
  userId: string | null;
}) {
  const { t } = useT();
  const username = profile.username ?? "";
  const { primary: displayName, secondary: handleLabel } =
    formatIdentityPair(profile);
  const avatarUrl = getAvatarUrl(profile.avatar_url);
  const roleChips = formatRoleChips(profile, t, { max: 1 });
  const reasonLine = reasonTagToI18n(profile.reason_tags ?? [], t);
  const isOwnCard = userId !== null && userId === profile.id;

  return (
    <article className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:bg-zinc-50/40">
      <Link
        href={username ? `/u/${username}` : "#"}
        className="flex min-w-0 items-start gap-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-100">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={48}
              height={48}
              sizes="48px"
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-medium text-zinc-500">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight text-zinc-900">
            {displayName}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
            {handleLabel && <span className="truncate">{handleLabel}</span>}
            {roleChips[0] && (
              <span className="rounded-full border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500">
                {roleChips[0].label}
              </span>
            )}
          </div>
        </div>
      </Link>

      {reasonLine && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-zinc-500">
          {reasonLine}
        </p>
      )}

      {!isOwnCard && (
        <div className="mt-4" onClick={(e) => e.stopPropagation()}>
          <FollowButton
            targetProfileId={profile.id}
            initialFollowing={initialFollowing}
            isPrivateTarget={profile.is_public === false}
            size="sm"
          />
        </div>
      )}
    </article>
  );
}
