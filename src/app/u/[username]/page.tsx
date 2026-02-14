import { notFound } from "next/navigation";
import {
  getMyProfileAsPublic,
  lookupPublicProfileByUsername,
  type ProfilePublic,
} from "@/lib/supabase/profiles";
import { listPublicArtworksByArtistId } from "@/lib/supabase/artworks";
import { UserProfileContent } from "@/components/UserProfileContent";

type Props = { params: Promise<{ username: string }> };

function normalizeUsername(u: string | null): string {
  return (u ?? "").trim().toLowerCase();
}

export default async function ProfilePage({ params }: Props) {
  const { username: paramUsername } = await params;
  const normalizedParam = paramUsername.trim().toLowerCase();

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
          <p className="text-zinc-600">This profile is private.</p>
        </main>
      );
    }
  } else if (!profile) {
    notFound();
  } else {
    p = profile as ProfilePublic;
  }

  const { data: artworks } = await listPublicArtworksByArtistId(p.id, {
    limit: 50,
  });

  return <UserProfileContent profile={p} artworks={artworks ?? []} />;
}
