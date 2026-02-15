"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getSession,
  sendPasswordReset,
} from "@/lib/supabase/auth";
import { ensureFreeEntitlement } from "@/lib/entitlements";
import { checkUsernameExists, getMyProfile, upsertProfile } from "@/lib/supabase/profiles";

const MAIN_ROLES = ["artist", "collector", "curator", "gallerist"] as const;
const ROLES = [...MAIN_ROLES];

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export default function OnboardingPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mainRole, setMainRole] = useState<string>("");
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [passwordResetSent, setPasswordResetSent] = useState(false);

  useEffect(() => {
    getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      setUserEmail(session.user.email ?? null);
      const { data: profile } = await getMyProfile();
      if (profile) {
        await ensureFreeEntitlement(session.user.id);
        router.replace("/feed?tab=all&sort=latest");
      }
    });
  }, [router]);

  function toggleRole(role: string) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const normalizedUsername = username.trim().toLowerCase();
    if (!USERNAME_REGEX.test(normalizedUsername)) {
      setError(
        "Username: 3–20 chars, lowercase letters, numbers, underscores only"
      );
      return;
    }

    if (roles.length < 1) {
      setError("Select at least one role");
      return;
    }

    const { data: { session } } = await getSession();
    if (!session?.user?.id) {
      router.replace("/login");
      return;
    }

    const { exists } = await checkUsernameExists(
      normalizedUsername,
      session.user.id
    );
    if (exists) {
      setError("Username already taken");
      return;
    }

    setLoading(true);
    const { error: err } = await upsertProfile({
      username: normalizedUsername,
      display_name: displayName.trim() || undefined,
      main_role: mainRole || undefined,
      roles,
    });
    setLoading(false);

    if (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      return;
    }

    await ensureFreeEntitlement(session.user.id);
    router.replace("/feed?tab=all&sort=latest");
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-6 text-xl font-semibold">Complete your profile</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="mb-1 block text-sm font-medium">
            Username *
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="username"
            required
            className="w-full rounded border border-zinc-300 px-3 py-2"
            autoComplete="username"
          />
          <p className="mt-1 text-xs text-zinc-500">
            3–20 chars, lowercase letters, numbers, underscores
          </p>
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
          <span className="mb-2 block text-sm font-medium">Roles * (at least one)</span>
          <div className="flex flex-wrap gap-3">
            {ROLES.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={roles.includes(r)}
                  onChange={() => toggleRole(r)}
                  className="rounded"
                />
                <span className="text-sm">{r.charAt(0).toUpperCase() + r.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Continue"}
        </button>
      </form>

      {/* Set password (optional, for magic-link users) */}
      <div className="mt-10 border-t border-zinc-200 pt-6">
        <p className="mb-2 text-sm font-medium text-zinc-700">
          Make future logins faster
        </p>
        <p className="mb-3 text-xs text-zinc-500">
          Set a password to sign in without email links.
        </p>
        {passwordResetSent ? (
          <p className="text-sm text-zinc-600">
            Check your email to set a password.
          </p>
        ) : (
          <button
            type="button"
            onClick={async () => {
              if (!userEmail) return;
              const { error: err } = await sendPasswordReset(userEmail);
              if (!err) setPasswordResetSent(true);
            }}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Set password
          </button>
        )}
      </div>
    </div>
  );
}
