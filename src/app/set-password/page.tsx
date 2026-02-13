"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { HAS_PASSWORD_KEY } from "@/lib/supabase/auth";
import { AuthGate } from "@/components/AuthGate";

const MIN_PASSWORD_LENGTH = 8;

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    if (typeof window !== "undefined") {
      window.localStorage.setItem(HAS_PASSWORD_KEY, "true");
    }
    router.replace("/feed?tab=all&sort=latest");
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-sm px-4 py-12">
        <h1 className="mb-2 text-xl font-semibold text-zinc-900">
          Set your password
        </h1>
        <p className="mb-6 text-sm text-zinc-600">
          Set a password so you can sign in with email and password anytime,
          without relying on email links.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              New password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded border border-zinc-300 px-3 py-2"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>
          <div>
            <label
              htmlFor="confirm"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Same as above"
              className="w-full rounded border border-zinc-300 px-3 py-2"
              autoComplete="new-password"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">{String(error)}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? "Setting password..." : "Set password"}
          </button>
        </form>
      </main>
    </AuthGate>
  );
}
