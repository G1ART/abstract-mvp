"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getSession } from "@/lib/supabase/auth";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const res1 = await getSession();
      if (cancelled) return;
      if (res1.data.session) {
        setHasSession(true);
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
      if (cancelled) return;
      const res2 = await getSession();
      setHasSession(!!res2.data.session);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    router.replace("/feed?tab=all&sort=latest");
  }

  if (hasSession === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-600">Loading...</p>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <p className="text-center text-zinc-600">
          Reset link invalid or expired. Please request again.
        </p>
        <a
          href="/login"
          className="mt-4 text-sm font-medium text-zinc-900 underline"
        >
          Back to login
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="mb-6 text-xl font-semibold">Set new password</h1>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs space-y-4"
      >
        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          className="w-full rounded border border-zinc-300 px-3 py-2"
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          className="w-full rounded border border-zinc-300 px-3 py-2"
          autoComplete="new-password"
        />
        <p className="text-xs text-zinc-500">
          Minimum {MIN_PASSWORD_LENGTH} characters
        </p>
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Set password"}
        </button>
      </form>
    </div>
  );
}
