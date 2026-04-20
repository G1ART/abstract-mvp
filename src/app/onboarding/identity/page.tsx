"use client";

/**
 * Identity-finish surface (Onboarding Identity Overhaul, Track E/F).
 *
 * Single-column, premium-copy page that forces a concrete identity
 * (display_name + non-placeholder username + main_role + roles) before
 * the user can reach product surfaces. Entry is enforced by
 * `routeByAuthState` at `/`, `/login`, `/auth/callback`, `AuthGate`,
 * and post-password sign-in.
 *
 * Field scope (intentionally narrow — brief Track F):
 *   - display_name
 *   - username
 *   - main_role (primary)
 *   - roles   (additional, including primary)
 *   - is_public
 * Bio / website / themes / etc. are delegated to Studio follow-through.
 */

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, getMyAuthState } from "@/lib/supabase/auth";
import { ensureFreeEntitlement } from "@/lib/entitlements";
import { getMyProfile, updateMyProfileBase } from "@/lib/supabase/profiles";
import { saveProfileUnified } from "@/lib/supabase/profileSaveUnified";
import { useT } from "@/lib/i18n/useT";
import {
  routeByAuthState,
  safeNextPath,
  LOGIN_PATH,
} from "@/lib/identity/routing";
import { ROLE_KEYS, type RoleKey } from "@/lib/identity/roles";
import { isPlaceholderUsername } from "@/lib/identity/placeholder";
import { UsernameField } from "@/components/onboarding/UsernameField";
import { IdentityPreview } from "@/components/onboarding/IdentityPreview";

const MAIN_ROLES = ROLE_KEYS;
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

type LoadState = "loading" | "ready" | "redirecting";

function IdentityInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const { t } = useT();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [mainRole, setMainRole] = useState<string>("");
  const [roles, setRoles] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);

  const [usernameReady, setUsernameReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await getSession();
      if (cancelled) return;
      if (!session) {
        router.replace(LOGIN_PATH);
        return;
      }
      const state = await getMyAuthState();
      if (cancelled) return;

      // If the user is already fine, short-circuit via the shared gate.
      if (state && !state.needs_identity_setup && !state.needs_onboarding) {
        setLoadState("redirecting");
        const { to } = routeByAuthState(state, { nextPath });
        router.replace(to);
        return;
      }

      setUserEmail(session.user.email ?? null);

      // Prefill from whatever is on the profile today (placeholder
      // username becomes an empty input so the field isn't pre-dirty).
      const { data: profile } = await getMyProfile();
      if (cancelled) return;
      const prof = profile as
        | {
            username?: string | null;
            display_name?: string | null;
            main_role?: string | null;
            roles?: string[] | null;
            is_public?: boolean | null;
          }
        | null;
      if (prof) {
        const u = (prof.username ?? "").trim().toLowerCase();
        setUsername(isPlaceholderUsername(u) ? "" : u);
        setDisplayName((prof.display_name ?? "").trim());
        setMainRole((prof.main_role ?? "").trim());
        setRoles(
          Array.isArray(prof.roles)
            ? prof.roles.filter((r): r is string => typeof r === "string")
            : []
        );
        if (typeof prof.is_public === "boolean") setIsPublic(prof.is_public);
      } else {
        // No profile row yet: seed from auth user_metadata (signup form
        // may have passed username/roles through).
        const meta = session.user.user_metadata as
          | {
              username?: string | null;
              display_name?: string | null;
              main_role?: string | null;
              roles?: string[] | null;
            }
          | undefined;
        if (meta?.username)
          setUsername(String(meta.username).toLowerCase());
        if (meta?.display_name) setDisplayName(String(meta.display_name));
        if (meta?.main_role) setMainRole(String(meta.main_role));
        if (Array.isArray(meta?.roles)) setRoles(meta.roles.filter((r): r is string => typeof r === "string"));
      }
      setLoadState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [router, nextPath]);

  const suggestionInput = useMemo(
    () => ({ displayName, email: userEmail }),
    [displayName, userEmail]
  );

  const handleUsernameValidity = useCallback((isReady: boolean) => {
    setUsernameReady(isReady);
  }, []);

  function toggleRole(role: string) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  const normalizedUsername = username.trim().toLowerCase();
  const trimmedDisplay = displayName.trim();
  const canSubmit =
    !saving &&
    usernameReady &&
    USERNAME_REGEX.test(normalizedUsername) &&
    !isPlaceholderUsername(normalizedUsername) &&
    trimmedDisplay.length > 0 &&
    roles.length >= 1 &&
    mainRole.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!trimmedDisplay) {
      setError(t("identity.finish.missingDisplayName"));
      return;
    }
    if (roles.length < 1 || !mainRole) {
      setError(t("identity.finish.missingRoles"));
      return;
    }
    if (!USERNAME_REGEX.test(normalizedUsername) || isPlaceholderUsername(normalizedUsername)) {
      setError(t("identity.username.live.invalid"));
      return;
    }

    setSaving(true);
    const {
      data: { session },
    } = await getSession();
    if (!session?.user?.id) {
      setSaving(false);
      router.replace(LOGIN_PATH);
      return;
    }

    // Username writes go through the unified save (username is not in
    // updateMyProfileBase's whitelist). Base fields then go through the
    // standard updateMyProfileBase path so existing validators apply.
    const usernameRes = await saveProfileUnified({
      basePatch: { username: normalizedUsername },
      detailsPatch: {},
      completeness: null,
    });
    if (!usernameRes.ok) {
      setSaving(false);
      setError(
        usernameRes.message?.trim()
          ? `${usernameRes.message} (${usernameRes.code ?? "Error"})`
          : t("identity.finish.error")
      );
      return;
    }

    const baseRes = await updateMyProfileBase({
      display_name: trimmedDisplay,
      main_role: mainRole,
      roles,
      is_public: isPublic,
    });
    if (baseRes.error) {
      setSaving(false);
      setError(t("identity.finish.error"));
      return;
    }

    await ensureFreeEntitlement(session.user.id);
    const freshState = await getMyAuthState();
    setSaving(false);
    const { to } = routeByAuthState(freshState, { nextPath });
    router.replace(to);
  }

  if (loadState !== "ready") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-lg font-semibold text-zinc-900">Abstract</p>
        <p className="text-zinc-600">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">
          {t("identity.finish.title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          {t("identity.finish.subtitle")}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          {t("identity.finish.oneTime")}
        </p>
      </header>

      <div className="mb-6">
        <IdentityPreview
          displayName={displayName}
          username={normalizedUsername}
          mainRole={mainRole}
          roles={roles}
          isPublic={isPublic}
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label
            htmlFor="identity-display-name"
            className="block text-sm font-medium text-zinc-900"
          >
            {t("identity.finish.labelDisplayName")}
          </label>
          <input
            id="identity-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("identity.finish.placeholderDisplayName")}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            autoComplete="name"
            maxLength={80}
            required
          />
        </div>

        <UsernameField
          value={username}
          onChange={setUsername}
          suggestionInput={suggestionInput}
          onValidityChange={handleUsernameValidity}
          inputId="identity-username"
        />

        <div className="space-y-2">
          <label
            htmlFor="identity-main-role"
            className="block text-sm font-medium text-zinc-900"
          >
            {t("identity.finish.labelPrimaryRole")}
          </label>
          <select
            id="identity-main-role"
            value={mainRole}
            onChange={(e) => {
              const next = e.target.value;
              setMainRole(next);
              if (next && !roles.includes(next)) {
                setRoles((prev) => [...prev, next]);
              }
            }}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            required
          >
            <option value="">{t("common.selectOption")}</option>
            {MAIN_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium text-zinc-900">
            {t("identity.finish.labelRoles")}
          </span>
          <div className="flex flex-wrap gap-2">
            {MAIN_ROLES.map((r: RoleKey) => {
              const active = roles.includes(r);
              return (
                <button
                  type="button"
                  key={r}
                  onClick={() => toggleRole(r)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  {t(`role.${r}`)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-md border border-zinc-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">
                {t("identity.finish.labelPublic")}
              </p>
              <p className="text-xs text-zinc-500">
                {isPublic
                  ? t("identity.finish.publicHint")
                  : t("identity.finish.privateHint")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPublic}
              onClick={() => setIsPublic((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                isPublic ? "bg-emerald-500" : "bg-zinc-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  isPublic ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? t("identity.finish.saving") : t("identity.finish.primaryCta")}
        </button>

        <p className="text-center text-xs text-zinc-500">
          {t("identity.finish.studioNext")}
        </p>
      </form>
    </main>
  );
}

export default function OnboardingIdentityPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center gap-3">
          <p className="text-lg font-semibold text-zinc-900">Abstract</p>
          <p className="text-zinc-600">Loading...</p>
        </div>
      }
    >
      <IdentityInner />
    </Suspense>
  );
}
