"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n/useT";
import { getSession } from "@/lib/supabase/auth";
import { getMyProfile } from "@/lib/supabase/profiles";
import {
  getDelegationByToken,
  acceptDelegationByToken,
  listMyDelegations,
} from "@/lib/supabase/delegations";
import type { GetDelegationByTokenResult } from "@/lib/supabase/delegations";

function scopeLabel(scope: string, t: (k: string) => string): string {
  switch (scope) {
    case "account":
      return t("delegation.inviteScopeAccount");
    case "project":
      return t("delegation.inviteScopeProject");
    case "inventory":
      return t("delegation.inviteScopeInventory");
    default:
      return scope;
  }
}

function InvitesDelegationInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { t } = useT();

  const [info, setInfo] = useState<GetDelegationByTokenResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setInfo({ found: false });
      setLoading(false);
      return;
    }
    const sessionRes = await getSession();
    setHasSession(!!sessionRes.data?.session);

    const { data: delegationData, error } = await getDelegationByToken(token);
    if (error) {
      setInfo({ found: false });
      setLoading(false);
      return;
    }
    setInfo(delegationData ?? { found: false });
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAccept() {
    if (!token || !info?.found) return;
    setAccepting(true);
    setAcceptError(null);
    const { data, error } = await acceptDelegationByToken(token);
    setAccepting(false);
    if (error) {
      setAcceptError(t("delegation.acceptFailed"));
      return;
    }
    if (data?.ok) {
      setAccepted(true);
      const { data: list } = await listMyDelegations();
      const received = list?.received ?? [];
      if (received.length > 1) {
        router.replace("/my/delegations");
      } else if (received.length === 1 && info.scope_type === "project" && info.project?.id) {
        router.replace(`/my/exhibitions/${info.project.id}/add`);
      } else {
        router.replace("/my/delegations");
      }
      return;
    }
    if (data?.reason === "email_mismatch") {
      setAcceptError(t("delegation.acceptFailed"));
    } else {
      setAcceptError(t("delegation.invalidOrExpired"));
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">{t("common.loading")}</p>
      </div>
    );
  }

  if (!info?.found || info.status !== "pending") {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="mb-4 text-xl font-semibold">{t("delegation.inviteTitle")}</h1>
        <p className="text-zinc-600">{t("delegation.invalidOrExpired")}</p>
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-zinc-700 underline">
          ← {t("common.backTo")} Home
        </Link>
      </div>
    );
  }

  const delegatorName =
    info.delegator?.display_name?.trim() ||
    (info.delegator?.username ? `@${info.delegator.username}` : null) ||
    "Someone";
  const scope = scopeLabel(info.scope_type ?? "project", t);
  const projectTitle = info.scope_type === "project" && info.project?.title ? ` "${info.project.title}"` : "";

  if (!hasSession) {
    const loginUrl = `/login?next=${encodeURIComponent(`/invites/delegation?token=${token}`)}`;
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="mb-4 text-xl font-semibold">{t("delegation.inviteTitle")}</h1>
        <p className="mb-2 text-zinc-700">
          {t("delegation.inviteFrom").replace("{name}", delegatorName)} {scope}
          {projectTitle}.
        </p>
        <p className="mb-6 text-zinc-600">{t("delegation.logInToAccept")}</p>
        <div className="flex gap-3">
          <Link
            href={loginUrl}
            className="rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800"
          >
            {t("delegation.logIn")}
          </Link>
          <Link
            href="/onboarding"
            className="rounded border border-zinc-300 px-4 py-2 hover:bg-zinc-50"
          >
            {t("delegation.signUp")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-4 text-xl font-semibold">{t("delegation.inviteTitle")}</h1>
      <p className="mb-6 text-zinc-700">
        {t("delegation.inviteFrom").replace("{name}", delegatorName)} {scope}
        {projectTitle}.
      </p>
      {acceptError && (
        <p className="mb-4 text-sm text-red-600">{acceptError}</p>
      )}
      {accepted ? (
        <p className="text-zinc-600">{t("delegation.accepted")}</p>
      ) : (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleAccept}
            disabled={accepting}
            className="rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {accepting ? t("common.loading") : t("delegation.accept")}
          </button>
          <Link
            href="/my/delegations"
            className="rounded border border-zinc-300 px-4 py-2 hover:bg-zinc-50"
          >
            {t("delegation.decline")}
          </Link>
        </div>
      )}
    </div>
  );
}

export default function InvitesDelegationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-zinc-500">Loading...</p>
        </div>
      }
    >
      <InvitesDelegationInner />
    </Suspense>
  );
}
