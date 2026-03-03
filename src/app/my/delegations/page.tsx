"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { useActingAs } from "@/context/ActingAsContext";
import {
  createDelegationInvite,
  createDelegationInviteForProfile,
  acceptDelegationById,
  declineDelegationById,
  listMyDelegations,
  revokeDelegation,
  type DelegationWithDetails,
  type ListMyDelegationsResult,
} from "@/lib/supabase/delegations";
import { getMyProfile } from "@/lib/supabase/profiles";
import { getSession } from "@/lib/supabase/auth";
import { searchPeople } from "@/lib/supabase/artists";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";
import type { PublicProfile } from "@/lib/supabase/artists";

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

export default function MyDelegationsPage() {
  const { t } = useT();
  const { setActingAs } = useActingAs();
  const [data, setData] = useState<ListMyDelegationsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [accountInviteEmail, setAccountInviteEmail] = useState("");
  const [accountInviteSending, setAccountInviteSending] = useState(false);
  const [accountInviteToast, setAccountInviteToast] = useState<"sent" | "failed" | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [inviteByProfileSending, setInviteByProfileSending] = useState(false);
  const [inviteByProfileToast, setInviteByProfileToast] = useState<"sent" | "failed" | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data: res } = await listMyDelegations();
    setData(res ?? { sent: [], received: [] });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setMyId(session.user.id);
    });
  }, []);

  const doSearch = useCallback(async () => {
    const q = searchQ.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const { data: list } = await searchPeople({ q, limit: 10 });
    setSearchResults(list ?? []);
    setSearchLoading(false);
  }, [searchQ]);

  useEffect(() => {
    const t = setTimeout(doSearch, 300);
    return () => clearTimeout(t);
  }, [searchQ, doSearch]);

  const filteredSearchResults = myId
    ? (searchResults ?? []).filter((p) => p.id !== myId)
    : searchResults ?? [];

  async function handleInviteByProfile(profile: PublicProfile) {
    setInviteByProfileSending(true);
    setInviteByProfileToast(null);
    const { data, error } = await createDelegationInviteForProfile({
      delegateProfileId: profile.id,
      scopeType: "account",
    });
    setInviteByProfileSending(false);
    if (error || !data) {
      setInviteByProfileToast("failed");
      return;
    }
    setInviteByProfileToast("sent");
    setSearchQ("");
    setSearchResults([]);
    load();
  }

  async function handleAccept(d: DelegationWithDetails) {
    if (!d.id) return;
    setAcceptingId(d.id);
    await acceptDelegationById(d.id);
    setAcceptingId(null);
    load();
  }

  async function handleDecline(d: DelegationWithDetails) {
    if (!d.id) return;
    setDecliningId(d.id);
    await declineDelegationById(d.id);
    setDecliningId(null);
    load();
  }

  async function handleRevoke(d: DelegationWithDetails) {
    if (!d.id) return;
    setRevokingId(d.id);
    await revokeDelegation(d.id);
    setRevokingId(null);
    load();
  }

  async function handleSendAccountInvite() {
    const email = accountInviteEmail.trim().toLowerCase();
    if (!email) return;
    setAccountInviteSending(true);
    setAccountInviteToast(null);
    const { data: inv, error: invErr } = await createDelegationInvite({
      delegateEmail: email,
      scopeType: "account",
    });
    if (invErr || !inv?.invite_token) {
      setAccountInviteToast("failed");
      setAccountInviteSending(false);
      return;
    }
    const { data: profile } = await getMyProfile();
    const inviterName =
      (profile as { display_name?: string | null; username?: string | null })?.display_name?.trim() ||
      (profile as { username?: string | null })?.username ||
      null;
    const res = await fetch("/api/delegation-invite-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toEmail: email,
        inviterName,
        scopeType: "account",
        inviteToken: inv.invite_token,
      }),
    });
    setAccountInviteSending(false);
    setAccountInviteToast(res.ok ? "sent" : "failed");
    if (res.ok) {
      setAccountInviteEmail("");
      load();
    }
  }

  function handleManage(d: DelegationWithDetails) {
    const label =
      d.delegator_profile?.display_name?.trim() ||
      (d.delegator_profile?.username ? `@${d.delegator_profile.username}` : null) ||
      "Account";
    setActingAs(d.delegator_profile_id, label ?? "Account");
    if (d.scope_type === "project" && d.project_id) {
      window.location.href = `/my/exhibitions/${d.project_id}/add`;
    } else {
      window.location.href = "/my";
    }
  }

  if (loading) {
    return (
      <AuthGate>
        <div className="mx-auto max-w-2xl px-4 py-8">
          <p className="text-zinc-500">{t("common.loading")}</p>
        </div>
      </AuthGate>
    );
  }

  const received = data?.received ?? [];
  const sent = data?.sent ?? [];

  return (
    <AuthGate>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold">{t("delegation.myDelegations")}</h1>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-zinc-500">
            {t("delegation.received")}
          </h2>
          {received.length === 0 ? (
            <p className="text-sm text-zinc-500">No invitations or delegations received.</p>
          ) : (
            <ul className="space-y-3">
              {received.map((d) => {
                const name =
                  d.delegator_profile?.display_name?.trim() ||
                  (d.delegator_profile?.username ? `@${d.delegator_profile.username}` : null) ||
                  "Someone";
                const scope = scopeLabel(d.scope_type, t);
                const projectTitle =
                  d.scope_type === "project" && d.project?.title ? ` — ${d.project.title}` : "";
                return (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3"
                  >
                    <span className="text-sm text-zinc-700">
                      {name}: {scope}
                      {projectTitle}
                      {d.status === "pending" && " (pending)"}
                    </span>
                    <span className="flex items-center gap-2">
                      {d.status === "pending" && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleAccept(d)}
                            disabled={acceptingId === d.id}
                            className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
                          >
                            {acceptingId === d.id ? "..." : t("delegation.accept")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecline(d)}
                            disabled={decliningId === d.id}
                            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                          >
                            {decliningId === d.id ? "..." : t("delegation.decline")}
                          </button>
                        </>
                      )}
                      {d.status === "active" && (
                        <button
                          type="button"
                          onClick={() => handleManage(d)}
                          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
                        >
                          {d.scope_type === "project" ? t("exhibition.manageExhibition") : "Manage"}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mb-8" ref={searchRef}>
          <h2 className="mb-3 text-sm font-medium text-zinc-500">{t("delegation.inviteAccountAccess")}</h2>
          <p className="mb-3 text-sm text-zinc-600">{t("delegation.inviteAccountAccessHint")}</p>

          <p className="mb-2 text-xs font-medium text-zinc-500">{t("delegation.inviteExistingUser")}</p>
          <div className="relative mb-4">
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder={t("delegation.searchUserPlaceholder")}
              className="w-full min-w-[200px] rounded border border-zinc-300 px-3 py-2 text-sm"
            />
            {searchLoading && (
              <p className="mt-1 text-xs text-zinc-400">{t("common.loading")}</p>
            )}
            {filteredSearchResults.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border border-zinc-200 bg-white py-1 shadow-lg">
                {filteredSearchResults.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleInviteByProfile(p)}
                      disabled={inviteByProfileSending}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                    >
                      {p.avatar_url ? (
                        <img
                          src={
                            p.avatar_url.startsWith("http")
                              ? p.avatar_url
                              : getArtworkImageUrl(p.avatar_url, "avatar")
                          }
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs text-zinc-500">
                          {(p.display_name ?? p.username ?? "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="truncate">
                        {p.display_name?.trim() || p.username ? `@${p.username}` : p.id.slice(0, 8)}
                      </span>
                      {p.username && (
                        <span className="truncate text-zinc-400">@{p.username}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {inviteByProfileToast && (
            <p className={`mb-3 text-xs ${inviteByProfileToast === "sent" ? "text-zinc-600" : "text-amber-600"}`}>
              {inviteByProfileToast === "sent" ? t("delegation.inviteSentToUser") : t("delegation.inviteToUserFailed")}
            </p>
          )}

          <p className="mb-2 text-xs font-medium text-zinc-500">{t("delegation.orInviteByEmail")}</p>
          <div className="flex flex-wrap items-end gap-2">
            <input
              type="email"
              value={accountInviteEmail}
              onChange={(e) => setAccountInviteEmail(e.target.value)}
              placeholder={t("delegation.inviteByEmail")}
              className="min-w-[200px] rounded border border-zinc-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleSendAccountInvite}
              disabled={accountInviteSending || !accountInviteEmail.trim()}
              className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {accountInviteSending ? t("delegation.sending") : t("delegation.sendInvite")}
            </button>
          </div>
          {accountInviteToast && (
            <p className={`mt-2 text-xs ${accountInviteToast === "sent" ? "text-zinc-600" : "text-amber-600"}`}>
              {accountInviteToast === "sent" ? t("upload.inviteSent") : t("upload.inviteSentFailed")}
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-zinc-500">{t("delegation.sent")}</h2>
          {sent.length === 0 ? (
            <p className="text-sm text-zinc-500">No invitations sent.</p>
          ) : (
            <ul className="space-y-3">
              {sent.map((d) => {
                const to =
                  d.delegate_profile?.display_name?.trim() ||
                  (d.delegate_profile?.username ? `@${d.delegate_profile.username}` : null) ||
                  d.delegate_email;
                const scope = scopeLabel(d.scope_type, t);
                const projectTitle =
                  d.scope_type === "project" && d.project?.title ? ` — ${d.project.title}` : "";
                return (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3"
                  >
                    <span className="text-sm text-zinc-700">
                      {to}: {scope}
                      {projectTitle} {d.status === "pending" && "(pending)"}
                    </span>
                    {(d.status === "active" || d.status === "pending") && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(d)}
                        disabled={revokingId === d.id}
                        className="text-sm text-red-600 hover:underline disabled:opacity-50"
                        title={d.status === "pending" ? t("delegation.cancelInvite") : t("delegation.revoke")}
                      >
                        {d.status === "pending" ? t("delegation.cancelInvite") : t("delegation.revoke")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="mt-6">
          <Link href="/my" className="text-sm font-medium text-zinc-700 hover:text-zinc-900">
            ← {t("common.backTo")} {t("nav.myProfile")}
          </Link>
        </p>
      </div>
    </AuthGate>
  );
}
