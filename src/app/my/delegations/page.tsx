"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { useActingAs } from "@/context/ActingAsContext";
import {
  listMyDelegations,
  revokeDelegation,
  type DelegationWithDetails,
  type ListMyDelegationsResult,
} from "@/lib/supabase/delegations";

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

  const load = useCallback(async () => {
    const { data: res } = await listMyDelegations();
    setData(res ?? { sent: [], received: [] });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRevoke(d: DelegationWithDetails) {
    if (!d.id) return;
    setRevokingId(d.id);
    await revokeDelegation(d.id);
    setRevokingId(null);
    load();
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
                    </span>
                    {d.status === "active" && (
                      <button
                        type="button"
                        onClick={() => handleManage(d)}
                        className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
                      >
                        {d.scope_type === "project" ? t("exhibition.manageExhibition") : "Manage"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
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
                    {d.status === "active" && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(d)}
                        disabled={revokingId === d.id}
                        className="text-sm text-red-600 hover:underline disabled:opacity-50"
                      >
                        {t("delegation.revoke")}
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
            ← {t("common.backTo")} {t("nav.me")}
          </Link>
        </p>
      </div>
    </AuthGate>
  );
}
