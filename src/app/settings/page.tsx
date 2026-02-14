"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import {
  getMyProfile,
  updateMyProfile,
  type UpdateProfileParams,
} from "@/lib/supabase/profiles";

const MAIN_ROLES = ["artist", "collector", "curator", "gallerist"] as const;
const ROLES = [...MAIN_ROLES];
const PROFILE_UPDATED_KEY = "profile_updated";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  main_role: string | null;
  roles: string[] | null;
  is_public: boolean | null;
};

export default function SettingsPage() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [mainRole, setMainRole] = useState<string>("");
  const [roles, setRoles] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyProfile().then(({ data: profile, error: err }) => {
      setLoading(false);
      if (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
        return;
      }
      const p = profile as Profile | null;
      if (p) {
        setUsername(p.username ?? null);
        setDisplayName(p.display_name ?? "");
        setBio(p.bio ?? "");
        setLocation(p.location ?? "");
        setWebsite(p.website ?? "");
        setMainRole(p.main_role ?? "");
        setRoles((p.roles as string[]) ?? []);
        setIsPublic(p.is_public ?? true);
      }
    });
  }, []);

  function toggleRole(role: string) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const finalRoles = [...roles];
    if (mainRole && !finalRoles.includes(mainRole)) {
      finalRoles.push(mainRole);
    }
    if (finalRoles.length < 1) {
      setError("Select at least one role");
      return;
    }

    setSaving(true);
    const payload: UpdateProfileParams = {
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
      location: location.trim() || null,
      website: website.trim() || null,
      main_role: mainRole || null,
      roles: finalRoles,
      is_public: isPublic,
    };
    const { error: err } = await updateMyProfile(payload);
    setSaving(false);

    if (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      return;
    }

    // Fetch refreshed profile to get username (do not depend on possibly-stale state)
    const { data: refreshed } = await getMyProfile();
    const profileUsername =
      (refreshed as Profile | null)?.username?.trim().toLowerCase() ?? "";

    console.log("settings save redirect username:", profileUsername);

    if (profileUsername) {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(PROFILE_UPDATED_KEY, "true");
      }
      router.push(`/u/${profileUsername}`);
    } else {
      setSaved(true);
    }
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold">Settings</h1>

        <div className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-zinc-700">Security</h2>
          <Link
            href="/set-password"
            className="text-sm text-zinc-600 underline hover:text-zinc-900"
          >
            Set password
          </Link>
          <p className="mt-1 text-xs text-zinc-500">
            Use a password to sign in with email and password (no email link required).
          </p>
        </div>

        {loading ? (
          <p className="text-zinc-600">Loading...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center justify-between">
              <label htmlFor="isPublic" className="text-sm font-medium">
                Public profile
              </label>
              <input
                id="isPublic"
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="rounded"
              />
            </div>

            <div>
              <label htmlFor="displayName" className="mb-1 block text-sm font-medium">
                Display name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                className="w-full rounded border border-zinc-300 px-3 py-2"
                autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="bio" className="mb-1 block text-sm font-medium">
                Bio
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Short bio"
                rows={3}
                className="w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="location" className="mb-1 block text-sm font-medium">
                Location
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location"
                className="w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="website" className="mb-1 block text-sm font-medium">
                Website
              </label>
              <input
                id="website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://"
                className="w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="mainRole" className="mb-1 block text-sm font-medium">
                Main role
              </label>
              <select
                id="mainRole"
                value={mainRole}
                onChange={(e) => setMainRole(e.target.value)}
                className="w-full rounded border border-zinc-300 px-3 py-2"
              >
                <option value="">Select</option>
                {MAIN_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="mb-2 block text-sm font-medium">
                Roles * (at least one)
              </span>
              <div className="flex flex-wrap gap-3">
                {ROLES.map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={roles.includes(r)}
                      onChange={() => toggleRole(r)}
                      className="rounded"
                    />
                    <span className="text-sm">
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            {saved && (
              <p className="text-sm text-green-600">Saved</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        )}
      </main>
    </AuthGate>
  );
}
