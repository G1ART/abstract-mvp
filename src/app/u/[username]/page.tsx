import { notFound } from "next/navigation";
import {
  getMyProfileAsPublic,
  lookupPublicProfileByUsername,
  type ProfilePublic,
} from "@/lib/supabase/profiles";
import {
  listPublicArtworksByArtistId,
  listPublicArtworksListedByProfileId,
  getProfileArtworkOrders,
  applyProfileOrdering,
} from "@/lib/supabase/artworks";
import { listExhibitionsForProfile, type ExhibitionWithCredits } from "@/lib/supabase/exhibitions";
import { getServerLocale, getT } from "@/lib/i18n/server";
import { UserProfileContent } from "@/components/UserProfileContent";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ mode?: string; tab?: string | string[] }>;
};

function normalizeUsername(u: string | null): string {
  return (u ?? "").trim().toLowerCase();
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const { username: paramUsername } = await params;
  const sp = await searchParams;
  const mode = typeof sp.mode === "string" ? sp.mode : Array.isArray(sp.mode) ? sp.mode[0] : undefined;
  const rawTab = sp.tab;
  const tabParam =
    typeof rawTab === "string" ? rawTab : Array.isArray(rawTab) ? rawTab[0] : undefined;
  const normalizedParam = paramUsername.trim().toLowerCase();
  const locale = await getServerLocale();
  const t = getT(locale);

  const { data: profile, isPrivate, notFound: profileNotFound, error } =
    await lookupPublicProfileByUsername(paramUsername);

  if (error || profileNotFound) {
    notFound();
  }

  let p: ProfilePublic;

  if (isPrivate) {
    // Allow self to view own private profile
    const { data: myProfile } = await getMyProfileAsPublic();
    if (
      myProfile &&
      normalizeUsername(myProfile.username) === normalizedParam
    ) {
      p = myProfile;
    } else {
      return (
        <main className="mx-auto max-w-2xl px-4 py-8">
          <p className="text-zinc-600">{t("profile.private")}</p>
        </main>
      );
    }
  } else if (!profile) {
    notFound();
  } else {
    p = profile as ProfilePublic;
  }

  const [
    { data: artworksAsArtist },
    { data: artworksAsLister },
    { data: exhibitions },
  ] = await Promise.all([
    listPublicArtworksByArtistId(p.id, { limit: 50 }),
    listPublicArtworksListedByProfileId(p.id, { limit: 50 }),
    listExhibitionsForProfile(p.id),
  ]);

  const seen = new Set<string>();
  const artworks: Awaited<ReturnType<typeof listPublicArtworksByArtistId>>["data"] = [];
  for (const a of artworksAsArtist ?? []) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      artworks.push(a);
    }
  }
  for (const a of artworksAsLister ?? []) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      artworks.push(a);
    }
  }

  // Apply profile-specific ordering
  const artworkIds = artworks.map((a) => a.id);
  const { data: profileOrderMap } = await getProfileArtworkOrders(p.id, artworkIds);
  const orderedArtworks = applyProfileOrdering(artworks, profileOrderMap ?? new Map());

  return (
    <UserProfileContent
      profile={p}
      artworks={orderedArtworks ?? []}
      exhibitions={(exhibitions ?? []) as ExhibitionWithCredits[]}
      initialReorderMode={mode === "reorder"}
      initialTabParam={tabParam ?? null}
    />
  );
}
