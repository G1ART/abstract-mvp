"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getSession,
  signUpWithPassword,
  HAS_PASSWORD_KEY,
} from "@/lib/supabase/auth";
import { ensureFreeEntitlement } from "@/lib/entitlements";
import { checkUsernameExists, getMyProfile } from "@/lib/supabase/profiles";
import { saveProfileUnified } from "@/lib/supabase/profileSaveUnified";
import { useT } from "@/lib/i18n/useT";

const MAIN_ROLES = ["artist", "collector", "curator", "gallerist"] as const;
const ROLES = [...MAIN_ROLES];
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
const MIN_PASSWORD_LENGTH = 8;

type UserMetadata = {
  username?: string | null;
  display_name?: string | null;
  main_role?: string | null;
  roles?: string[] | null;
};

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useT();
  const [mode, setMode] = useState<"check" | "signup" | "profile">("check");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mainRole, setMainRole] = useState<string>("");
  const [roles, setRoles] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [signupEmailSent, setSignupEmailSent] = useState(false);

  useEffect(() => {
    getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: profile } = await getMyProfile();
        if (profile) {
          await ensureFreeEntitlement(session.user.id);
          router.replace("/feed?tab=all&sort=latest");
          return;
        }
        setUserEmail(session.user.email ?? null);
        const meta = session.user.user_metadata as UserMetadata | undefined;
        if (meta?.username) setUsername(String(meta.username).toLowerCase());
        if (meta?.display_name) setDisplayName(String(meta.display_name));
        if (meta?.main_role) setMainRole(String(meta.main_role));
        if (Array.isArray(meta?.roles) && meta.roles.length) setRoles(meta.roles);
        setMode("profile");
      } else {
        setMode("signup");
      }
    });
  }, [router]);

  function toggleRole(role: string) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const normalizedUsername = username.trim().toLowerCase();
    if (!USERNAME_REGEX.test(normalizedUsername)) {
      setError(t("onboarding.errorUsernameInvalid"));
      return;
    }
    if (roles.length < 1) {
      setError(t("onboarding.errorSelectRole"));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("onboarding.errorPasswordMin"));
      return;
    }
    if (password !== passwordConfirm) {
      setError(t("onboarding.errorPasswordMismatch"));
      return;
    }

    setLoading(true);
    const { data, error: err } = await signUpWithPassword(email.trim(), password, {
      username: normalizedUsername,
      display_name: displayName.trim() || undefined,
      main_role: mainRole || undefined,
      roles,
    });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    if (data?.user && !data?.session) {
      setSignupEmailSent(true);
      return;
    }

    if (data?.session?.user?.id) {
      const res = await saveProfileUnified({
        basePatch: {
          username: normalizedUsername,
          display_name: displayName.trim() || undefined,
          main_role: mainRole || undefined,
          roles,
        },
        detailsPatch: {},
        completeness: null,
      });
      if (!res.ok) {
        setError(`${res.code ?? "Error"} ${res.message}`);
        return;
      }
      await ensureFreeEntitlement(data.session.user.id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(HAS_PASSWORD_KEY, "true");
      }
      router.replace("/feed?tab=all&sort=latest");
    }
  }

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const normalizedUsername = username.trim().toLowerCase();
    if (!USERNAME_REGEX.test(normalizedUsername)) {
      setError(t("onboarding.errorUsernameInvalid"));
      return;
    }
    if (roles.length < 1) {
      setError(t("onboarding.errorSelectRole"));
      return;
    }

    const { data: { session } } = await getSession();
    if (!session?.user?.id) {
      router.replace("/login");
      return;
    }

    const { exists } = await checkUsernameExists(normalizedUsername, session.user.id);
    if (exists) {
      setError(t("onboarding.errorUsernameTaken"));
      return;
    }

    setLoading(true);
    const res = await saveProfileUnified({
      basePatch: {
        username: normalizedUsername,
        display_name: displayName.trim() || undefined,
        main_role: mainRole || undefined,
        roles,
      },
      detailsPatch: {},
      completeness: null,
    });
    setLoading(false);
    if (!res.ok) {
      setError(
        res.message?.trim()
          ? `${res.message} (${res.code ?? "Error"})`
          : "프로필 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."
      );
      return;
    }

    await ensureFreeEntitlement(session.user.id);
    if (typeof window !== "undefined" && window.localStorage.getItem(HAS_PASSWORD_KEY) !== "true") {
      router.replace("/set-password");
    } else {
      router.replace("/feed?tab=all&sort=latest");
    }
  }

  if (mode === "check") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-lg font-semibold text-zinc-900">Abstract</p>
        <p className="text-zinc-600">{t("common.loading")}</p>
      </div>
    );
  }

  if (mode === "signup") {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="mb-2 text-xl font-semibold">{t("onboarding.createAccount")}</h1>
        <p className="mb-6 text-sm text-zinc-500">
          {t("onboarding.signupHint")}
        </p>

        {signupEmailSent ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <p className="font-medium text-zinc-900">{t("onboarding.checkEmailTitle")}</p>
            <p className="mt-1 text-sm text-zinc-600">
              {t("onboarding.checkEmailBody")}
            </p>
            <Link href="/login" className="mt-4 inline-block text-sm font-medium text-zinc-700 hover:text-zinc-900">
              ← {t("common.backTo")} {t("auth.backToSignIn")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label htmlFor="signup-email" className="mb-1 block text-sm font-medium">
                {t("onboarding.labelEmail")}
              </label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("onboarding.placeholderEmail")}
                required
                className="w-full rounded border border-zinc-300 px-3 py-2"
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="signup-password" className="mb-1 block text-sm font-medium">
                {t("onboarding.labelPassword")}
              </label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("setPassword.placeholderPassword")}
                required
                minLength={MIN_PASSWORD_LENGTH}
                className="w-full rounded border border-zinc-300 px-3 py-2"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="signup-password-confirm" className="mb-1 block text-sm font-medium">
                {t("onboarding.labelConfirmPassword")}
              </label>
              <input
                id="signup-password-confirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder={t("onboarding.placeholderRepeatPassword")}
                required
                className="w-full rounded border border-zinc-300 px-3 py-2"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="signup-username" className="mb-1 block text-sm font-medium">
                {t("onboarding.labelUsername")}
              </label>
              <input
                id="signup-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder={t("onboarding.placeholderUsername")}
                required
                className="w-full rounded border border-zinc-300 px-3 py-2"
                autoComplete="username"
              />
              <p className="mt-1 text-xs text-zinc-500">
                {t("onboarding.usernameHint")}
              </p>
            </div>
            <div>
              <label htmlFor="signup-displayName" className="mb-1 block text-sm font-medium">
                {t("onboarding.labelDisplayName")}
              </label>
              <input
                id="signup-displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("onboarding.placeholderDisplayName")}
                className="w-full rounded border border-zinc-300 px-3 py-2"
                autoComplete="name"
              />
            </div>
            <div>
              <label htmlFor="signup-mainRole" className="mb-1 block text-sm font-medium">
                {t("onboarding.labelMainRole")}
              </label>
              <select
                id="signup-mainRole"
                value={mainRole}
                onChange={(e) => setMainRole(e.target.value)}
                className="w-full rounded border border-zinc-300 px-3 py-2"
              >
                <option value="">{t("common.selectOption")}</option>
                {MAIN_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="mb-2 block text-sm font-medium">{t("onboarding.labelRoles")}</span>
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
              {loading ? t("onboarding.creatingAccount") : t("onboarding.createAccountButton")}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-zinc-500">
          {t("onboarding.alreadyHaveAccount")}{" "}
          <Link href="/login" className="font-medium text-zinc-700 hover:text-zinc-900">
            {t("auth.backToSignIn")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-2 text-xl font-semibold">{t("onboarding.completeProfile")}</h1>
      <p className="mb-6 text-sm text-zinc-500">{t("onboarding.completeProfileHint")}</p>
      <form onSubmit={handleProfileSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="mb-1 block text-sm font-medium">
            {t("onboarding.labelUsername")}
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder={t("onboarding.placeholderUsername")}
            required
            className="w-full rounded border border-zinc-300 px-3 py-2"
            autoComplete="username"
          />
          <p className="mt-1 text-xs text-zinc-500">
            {t("onboarding.usernameHint")}
          </p>
        </div>

        <div>
          <label htmlFor="displayName" className="mb-1 block text-sm font-medium">
            {t("onboarding.labelDisplayName")}
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("onboarding.placeholderDisplayName")}
            className="w-full rounded border border-zinc-300 px-3 py-2"
            autoComplete="name"
          />
        </div>

        <div>
          <label htmlFor="mainRole" className="mb-1 block text-sm font-medium">
            {t("onboarding.labelMainRole")}
          </label>
          <select
            id="mainRole"
            value={mainRole}
            onChange={(e) => setMainRole(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2"
          >
            <option value="">{t("common.selectOption")}</option>
            {MAIN_ROLES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium">{t("onboarding.labelRoles")}</span>
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
          {loading ? t("onboarding.saving") : t("onboarding.continue")}
        </button>
      </form>

      <div className="mt-10 border-t border-zinc-200 pt-6">
        <p className="mb-2 text-sm font-medium text-zinc-700">
          {t("onboarding.setPasswordLater")}
        </p>
        <p className="text-xs text-zinc-500">
          {t("onboarding.setPasswordLaterHint")}
        </p>
      </div>
    </div>
  );
}
