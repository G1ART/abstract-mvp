"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import {
  getSession,
  HAS_PASSWORD_KEY,
  sendMagicLink,
  signInWithPassword,
} from "@/lib/supabase/auth";
import { getMyProfile } from "@/lib/supabase/profiles";

const EMAIL_COOLDOWN_SEC = 30;
const RATE_LIMIT_PATTERNS = [
  "rate limit",
  "too many",
  "exceeded",
  "429",
  "email sending",
];

function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  return RATE_LIMIT_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicCooldown, setMagicCooldown] = useState(0);

  useEffect(() => {
    getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data: profile } = await getMyProfile();
      if (!profile) {
        router.replace("/onboarding");
        return;
      }
      if (typeof window !== "undefined" && window.localStorage.getItem(HAS_PASSWORD_KEY) !== "true") {
        router.replace("/set-password");
        return;
      }
      router.replace("/feed?tab=all&sort=latest");
    });
  }, [router]);

  useEffect(() => {
    if (magicCooldown <= 0) return;
    const t = setInterval(() => setMagicCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [magicCooldown]);

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await sendMagicLink(email);
    setLoading(false);
    if (err) {
      setError(
        isRateLimitError(err.message)
          ? "Email sending is temporarily limited. Please use password login or try later."
          : err.message
      );
      return;
    }
    setSent(true);
    setMagicCooldown(EMAIL_COOLDOWN_SEC);
  }

  async function handlePasswordSignIn(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await signInWithPassword(email, password);
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(HAS_PASSWORD_KEY, "true");
    }
    router.replace("/");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="mb-6 text-xl font-semibold">{t("login.title")}</h1>

      {sent ? (
        <p className="text-zinc-600">{t("login.checkEmail")}</p>
      ) : (
        <div className="w-full max-w-xs space-y-6">
          {/* Password login (primary) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
            }}
            className="space-y-4"
          >
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-zinc-300 px-3 py-2"
              autoComplete="email"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded border border-zinc-300 px-3 py-2"
              autoComplete="current-password"
            />
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handlePasswordSignIn}
                disabled={loading}
                className="w-full rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {t("login.signIn")}
              </button>
              <p className="text-center text-sm text-zinc-500">
                {t("login.noAccount")}
                <br />
                <Link href="/onboarding" className="font-medium text-zinc-700 hover:text-zinc-900">
                  {t("login.signUpWithEmail")}
                </Link>
              </p>
            </div>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-zinc-500">
                {t("login.useEmailLink")}
              </span>
            </div>
          </div>

          {/* Magic link fallback */}
          <form
            onSubmit={handleMagicLink}
            className="space-y-4"
          >
            <input
              type="email"
              placeholder={t("login.magicLinkPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-zinc-300 px-3 py-2"
              autoComplete="email"
            />
            <button
              type="submit"
              disabled={loading || magicCooldown > 0}
              className="w-full rounded border border-zinc-300 px-4 py-2 hover:bg-zinc-50 disabled:opacity-50"
            >
              {magicCooldown > 0
                ? `${t("login.sendMagicLink")} (${magicCooldown}s)`
                : t("login.sendMagicLink")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
