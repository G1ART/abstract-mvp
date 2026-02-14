import { notFound } from "next/navigation";
import {
  lookupPublicProfileByUsername,
  type ProfilePublic,
} from "@/lib/supabase/profiles";
import { listPublicArtworksByArtistId } from "@/lib/supabase/artworks";
import { UserProfileContent } from "@/components/UserProfileContent";

type Props = { params: Promise<{ username: string }> };

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const { data: profile, isPrivate, notFound: profileNotFound, error } =
    await lookupPublicProfileByUsername(username);

  if (error || profileNotFound) {
    notFound();
  }

  if (isPrivate) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-zinc-600">This profile is private.</p>
      </main>
    );
  }

  if (!profile) {
    notFound();
  }

  const p = profile as ProfilePublic;
  const { data: artworks } = await listPublicArtworksByArtistId(p.id, {
    limit: 50,
  });

  return <UserProfileContent profile={p} artworks={artworks ?? []} />;
}
