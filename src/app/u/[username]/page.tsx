import { notFound } from "next/navigation";
import { lookupPublicProfileByUsername } from "@/lib/supabase/profiles";
import { ProfileActions } from "@/components/ProfileActions";

type Props = { params: Promise<{ username: string }> };

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  main_role: string | null;
};

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

  const p = profile as Profile;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {p.display_name ?? p.username}
          </h1>
          <p className="text-sm text-zinc-500">@{p.username}</p>
          {p.main_role && (
            <p className="mt-1 text-sm text-zinc-600">{p.main_role}</p>
          )}
        </div>
        <ProfileActions profileId={p.id} />
      </div>
    </main>
  );
}
