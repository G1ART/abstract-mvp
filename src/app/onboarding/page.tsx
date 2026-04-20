"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getSession,
  getMyAuthState,
  signUpWithPassword,
} from "@/lib/supabase/auth";
import { ensureFreeEntitlement } from "@/lib/entitlements";
import { checkUsernameExists, getMyProfile } from "@/lib/supabase/profiles";
import { saveProfileUnified } from "@/lib/supabase/profileSaveUnified";
import { useT } from "@/lib/i18n/useT";
import { formatIdentityPair, formatRoleChips } from "@/lib/identity/format";
import { ROLE_KEYS, type RoleKey } from "@/lib/identity/roles";
import { routeByAuthState, safeNextPath, IDENTITY_FINISH_PATH } from "@/lib/identity/routing";

const MAIN_ROLES = ROLE_KEYS;
const ROLES = [...MAIN_ROLES];
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
const MIN_PASSWORD_LENGTH = 8;

type UsernameCheckState =
  | { kind: "idle" }
  | { kind: "invalid" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken" };

type UserMetadata = {
  username?: string | null;
  display_name?: string | null;
  main_role?: string | null;
  roles?: string[] | null;
};

function OnboardingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const { t } = useT();
  const [mode, setMode] = useState<"check" | "signup" | "profile">("check");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mainRole, setMainRole] = useState<string>("");
  const [roles, setRoles] = useState<string[]>([]);

  const [isPublic, setIsPublic] = useState(true);
  const [usernameCheck, setUsernameCheck] = useState<UsernameCheckState>({ kind: "idle" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [signupEmailSent, setSignupEmailSent] = useState(false);
  const checkSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await getSession();
      if (cancelled) return;
      if (!session) {
        setMode("signup");
        return;
      }
      // Signed-in arrivals are handled by the unified gate. Anyone who
      // needs identity completion (missing row, placeholder username,
      // empty display_name, or empty roles) is forwarded to the polished
      // identity-finish surface; anyone already complete goes to `next`.
      const state = await getMyAuthState();
      if (cancelled) return;

      if (state && (state.needs_identity_setup || state.needs_onboarding)) {
        await ensureFreeEntitlement(session.user.id);
        const qs = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
        router.replace(`${IDENTITY_FINISH_PATH}${qs}`);
        return;
      }

      // Fully complete: honor the gate's decision (next, set-password, etc.)
      await ensureFreeEntitlement(session.user.id);
      const { to } = routeByAuthState(state, { nextPath });
      router.replace(to);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, nextPath]);

  function toggleRole(role: string) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  const normalizedUsername = username.trim().toLowerCase();
  useEffect(() => {
    if (!normalizedUsername) {
      setUsernameCheck({ kind: "idle" });
      return;
    }
    if (!USERNAME_REGEX.test(normalizedUsername)) {
      setUsernameCheck({ kind: "invalid" });
      return;
    }
    setUsernameCheck({ kind: "checking" });
    const seq = ++checkSeqRef.current;
    const handle = setTimeout(async () => {
      const { data: { session } } = await getSession();
      const { exists } = await checkUsernameExists(
        normalizedUsername,
        session?.user?.id
      );
      if (seq !== checkSeqRef.current) return;
      setUsernameCheck({ kind: exists ? "taken" : "available" });
    }, 350);
    return () => clearTimeout(handle);
  }, [normalizedUsername]);

  const previewRoles = useMemo(() => {
    const filtered = roles.filter((r): r is RoleKey =>
      (ROLE_KEYS as readonly string[]).includes(r)
    );
    return filtered;
  }, [roles]);

  const previewProfile = useMemo(
    () => ({
      display_name: displayName.trim() || null,
      username: normalizedUsername || null,
      main_role: mainRole || null,
      roles: previewRoles,
    }),
    [displayName, normalizedUsername, mainRole, previewRoles]
  );
  const identityPreview = formatIdentityPair(previewProfile);
  const rolePreviewChips = formatRoleChips(previewProfile, t, { max: 3 });

  const isUsernameReady =
    usernameCheck.kind === "available" || (mode === "profile" && usernameCheck.kind === "idle");
  const canSubmitProfile = isUsernameReady && roles.length >= 1 && !loading;

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
      // Route through the unified gate: signup with immediate session
      // typically lands on set-password next, identity-finish if the
      // profile save somehow skipped a required field, or `next`.
      const state = await getMyAuthState();
      const { to } = routeByAuthState(state, { nextPath });
      router.replace(to);
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
        is_public: isPublic,
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
    const state = await getMyAuthState();
    const { to } = routeByAuthState(state, { nextPath });
    router.replace(to);
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

  const usernameStatus = (() => {
    switch (usernameCheck.kind) {
      case "checking":
        return { label: t("onboarding.usernameChecking"), tone: "text-zinc-500" };
      case "available":
        return { label: t("onboarding.usernameAvailable"), tone: "text-emerald-600" };
      case "taken":
        return { label: t("onboarding.usernameTaken"), tone: "text-red-600" };
      case "invalid":
        return { label: t("onboarding.errorUsernameInvalid"), tone: "text-red-600" };
      default:
        return null;
    }
  })();

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-2 text-xl font-semibold">{t("onboarding.completeProfile")}</h1>
      <p className="mb-6 text-sm text-zinc-500">{t("onboarding.completeProfileHint")}</p>

      <section
        aria-label={t("onboarding.previewLabel")}
        className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4"
      >
        <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">
          {t("onboarding.previewLabel")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-zinc-900">
            {identityPreview.primary || t("onboarding.previewEmpty")}
          </span>
          {identityPreview.secondary && (
            <span className="text-sm text-zinc-500">{identityPreview.secondary}</span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${isPublic ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-700"}`}
          >
            {isPublic ? t("studio.hero.public") : t("studio.hero.private")}
          </span>
        </div>
        {rolePreviewChips.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1">
            {rolePreviewChips.map((chip) => (
              <span
                key={chip.key}
                className={`rounded-full px-2 py-0.5 text-xs ${chip.isPrimary ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"}`}
              >
                {chip.label}
              </span>
            ))}
          </p>
        )}
        {userEmail && <p className="mt-2 text-xs text-zinc-500">{userEmail}</p>}
      </section>

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
            aria-describedby="username-status"
          />
          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-zinc-500">{t("onboarding.usernameHint")}</p>
            {usernameStatus && (
              <p id="username-status" className={`text-xs ${usernameStatus.tone}`}>
                {usernameStatus.label}
              </p>
            )}
          </div>
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

        <div className="rounded-lg border border-zinc-200 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">
                {t("onboarding.privacyTitle")}
              </p>
              <p className="text-xs text-zinc-500">
                {isPublic
                  ? t("onboarding.privacyPublicHint")
                  : t("onboarding.privacyPrivateHint")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPublic}
              onClick={() => setIsPublic((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${isPublic ? "bg-emerald-500" : "bg-zinc-300"}`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isPublic ? "translate-x-5" : "translate-x-0.5"}`}
              />
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmitProfile}
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

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center gap-3">
          <p className="text-lg font-semibold text-zinc-900">Abstract</p>
          <p className="text-zinc-600">Loading...</p>
        </div>
      }
    >
      <OnboardingInner />
    </Suspense>
  );
}
