"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import {
  getSession,
  getMyAuthState,
  sendMagicLink,
  signInWithPassword,
} from "@/lib/supabase/auth";
import { routeByAuthState, safeNextPath } from "@/lib/identity/routing";

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

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicCooldown, setMagicCooldown] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await getSession();
      if (cancelled || !session) return;
      const state = await getMyAuthState();
      if (cancelled) return;
      const { to } = routeByAuthState(state, { nextPath, sessionPresent: true });
      router.replace(to);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, nextPath]);

  useEffect(() => {
    if (magicCooldown <= 0) return;
    const t = setInterval(() => setMagicCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [magicCooldown]);

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await sendMagicLink(email, nextPath ?? undefined);
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
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }
    // Password login: route through the identity gate exactly like
    // magic-link / auth-callback so placeholder users never leak into
    // the product (Onboarding Identity Overhaul, Track D/J). Because
    // signInWithPassword just succeeded, the session is definitely
    // present — pass `sessionPresent` so a transient RPC failure falls
    // through to the default destination instead of bouncing us back
    // to /login in a loop.
    const state = await getMyAuthState();
    setLoading(false);
    const { to } = routeByAuthState(state, { nextPath, sessionPresent: true });
    router.replace(to);
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
            onSubmit={handlePasswordSignIn}
            className="space-y-4"
          >
            <input
              type="email"
              placeholder={t("login.placeholderEmail")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-zinc-300 px-3 py-2"
              autoComplete="email"
            />
            <input
              type="password"
              placeholder={t("login.placeholderPassword")}
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
                type="submit"
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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center px-4">
          <h1 className="mb-6 text-xl font-semibold">Log in</h1>
          <p className="text-zinc-500">Loading...</p>
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
