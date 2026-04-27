"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { useActingAs } from "@/context/ActingAsContext";
import {
  acceptDelegationById,
  declineDelegationById,
  listMyDelegations,
  type DelegationPreset,
  type DelegationWithDetails,
  type ListMyDelegationsResult,
} from "@/lib/supabase/delegations";
import { getSession } from "@/lib/supabase/auth";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";
import { TourTrigger, TourHelpButton } from "@/components/tour";
import { TOUR_IDS } from "@/lib/tours/tourRegistry";
import { CreateDelegationWizard } from "@/components/delegation/CreateDelegationWizard";
import { DelegationDetailDrawer } from "@/components/delegation/DelegationDetailDrawer";

type ReceivedTab = "pending" | "active" | "closed";

function presetTitleKey(p: DelegationPreset | null | undefined): string | null {
  if (!p) return null;
  switch (p) {
    case "operations": return "delegation.preset.operations.title";
    case "content": return "delegation.preset.content.title";
    case "review": return "delegation.preset.review.title";
    case "project_co_edit": return "delegation.preset.projectCoEdit.title";
    case "project_works_only": return "delegation.preset.projectWorksOnly.title";
    case "project_review": return "delegation.preset.projectReview.title";
  }
}

function statusBucket(status: string): ReceivedTab {
  if (status === "pending") return "pending";
  if (status === "active") return "active";
  return "closed";
}

function tabLabel(tab: ReceivedTab, t: (k: string) => string): string {
  if (tab === "pending") return t("delegation.tabPending");
  if (tab === "active") return t("delegation.tabActive");
  return t("delegation.tabClosed");
}

function dateLabel(d: DelegationWithDetails, t: (k: string) => string): string | null {
  const fmt = (val: string | null | undefined) => {
    if (!val) return null;
    try {
      return new Date(val).toLocaleDateString("ko-KR", {
        year: "numeric", month: "short", day: "numeric",
      });
    } catch {
      return null;
    }
  };
  if (d.status === "pending" && d.invited_at) {
    const v = fmt(d.invited_at);
    return v ? t("delegation.dateInvited").replace("{date}", v) : null;
  }
  if (d.status === "active" && d.accepted_at) {
    const v = fmt(d.accepted_at);
    return v ? t("delegation.dateAccepted").replace("{date}", v) : null;
  }
  if (d.status === "declined" && d.declined_at) {
    const v = fmt(d.declined_at);
    return v ? t("delegation.dateDeclined").replace("{date}", v) : null;
  }
  if (d.status === "revoked" && d.revoked_at) {
    const v = fmt(d.revoked_at);
    return v ? t("delegation.dateRevoked").replace("{date}", v) : null;
  }
  return null;
}

function scopeText(d: DelegationWithDetails, t: (k: string) => string): string {
  if (d.scope_type === "project") {
    if (d.project?.title) {
      return t("delegation.scopeExhibitionPrefix").replace("{title}", d.project.title);
    }
    return t("delegation.scopeProject");
  }
  return t("delegation.scopeAccount");
}

function statusToneClasses(status: string): string {
  switch (status) {
    case "pending": return "bg-amber-100 text-amber-900";
    case "active": return "bg-emerald-100 text-emerald-900";
    default: return "bg-zinc-200 text-zinc-700";
  }
}

export default function MyDelegationsPage() {
  const { t } = useT();
  const { setActingAs } = useActingAs();
  const [data, setData] = useState<ListMyDelegationsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ReceivedTab>("pending");
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOwnerView, setDetailOwnerView] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: res } = await listMyDelegations();
    setData(res ?? { sent: [], received: [] });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getSession().then(({ data: { session } }) => setMyId(session?.user?.id ?? null));
  }, []);

  const received = data?.received ?? [];
  const sent = data?.sent ?? [];

  const receivedByTab = useMemo(() => {
    const groups: Record<ReceivedTab, DelegationWithDetails[]> = {
      pending: [], active: [], closed: [],
    };
    for (const d of received) {
      groups[statusBucket(d.status)].push(d);
    }
    return groups;
  }, [received]);

  // Auto-pick the most relevant tab when there's pending or active.
  useEffect(() => {
    if (loading) return;
    if (receivedByTab.pending.length > 0) setTab("pending");
    else if (receivedByTab.active.length > 0) setTab("active");
  }, [loading, receivedByTab.pending.length, receivedByTab.active.length]);

  const handleAccept = async (d: DelegationWithDetails) => {
    if (!d.id) return;
    setAcceptingId(d.id);
    await acceptDelegationById(d.id);
    setAcceptingId(null);
    load();
  };

  const handleDecline = async (d: DelegationWithDetails) => {
    if (!d.id) return;
    setDecliningId(d.id);
    await declineDelegationById(d.id);
    setDecliningId(null);
    load();
  };

  const handleManage = (d: DelegationWithDetails) => {
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
  };

  const openDetail = (d: DelegationWithDetails, viewerIsOwner: boolean) => {
    setDetailOwnerView(viewerIsOwner);
    setDetailId(d.id);
  };

  const isEmpty = !loading && received.length === 0 && sent.length === 0;

  return (
    <AuthGate>
      <TourTrigger tourId={TOUR_IDS.delegation} />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div data-tour="delegation-header" className="mb-2 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 pr-2">
            <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900">{t("delegation.myDelegations")}</h1>
            <p className="text-sm text-zinc-600">{t("delegation.subtitle")}</p>
          </div>
          <TourHelpButton tourId={TOUR_IDS.delegation} />
        </div>
        <p className="mb-6 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {t("delegation.trustNote")}
        </p>

        <div data-tour="delegation-wizard-cta" className="mb-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {t("delegation.cta.create")}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">{t("common.loading")}</p>
        ) : isEmpty ? (
          <EmptyState onCreate={() => setWizardOpen(true)} />
        ) : (
          <>
            <section data-tour="delegation-received" className="mb-10">
              <header className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">{t("delegation.received")}</h2>
              </header>

              <div role="tablist" className="mb-3 inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-1 text-xs">
                {(["pending", "active", "closed"] as ReceivedTab[]).map((tk) => {
                  const count = receivedByTab[tk].length;
                  const active = tab === tk;
                  return (
                    <button
                      key={tk}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(tk)}
                      className={`rounded-md px-3 py-1.5 ${
                        active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
                      }`}
                    >
                      {tabLabel(tk, t)}
                      {count > 0 && (
                        <span className={`ml-1.5 inline-block min-w-4 rounded-full px-1 text-[10px] ${
                          active ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-600"
                        }`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {receivedByTab[tab].length === 0 ? (
                <p className="text-sm text-zinc-500">{t("delegation.receivedEmpty")}</p>
              ) : (
                <ul className="space-y-2.5">
                  {receivedByTab[tab].map((d) => (
                    <li key={d.id}>
                      <ReceivedCard
                        d={d}
                        t={t}
                        onAccept={() => handleAccept(d)}
                        onDecline={() => handleDecline(d)}
                        onManage={() => handleManage(d)}
                        onView={() => openDetail(d, false)}
                        accepting={acceptingId === d.id}
                        declining={decliningId === d.id}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section data-tour="delegation-sent">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900">{t("delegation.sent")}</h2>
              {sent.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("delegation.sentEmpty")}</p>
              ) : (
                <ul className="space-y-2.5">
                  {sent.map((d) => (
                    <li key={d.id}>
                      <SentCard
                        d={d}
                        t={t}
                        onView={() => openDetail(d, true)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <p className="mt-10">
          <Link href="/my" className="text-sm font-medium text-zinc-700 hover:text-zinc-900">
            ← {t("profile.privateBackToMy")}
          </Link>
        </p>
      </div>

      <CreateDelegationWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => {
          setWizardOpen(false);
          load();
        }}
      />

      <DelegationDetailDrawer
        delegationId={detailId}
        viewerIsOwner={detailOwnerView}
        onClose={() => setDetailId(null)}
        onChanged={load}
      />
    </AuthGate>
  );
}

function ReceivedCard({
  d, t, onAccept, onDecline, onManage, onView, accepting, declining,
}: {
  d: DelegationWithDetails;
  t: (k: string) => string;
  onAccept: () => void;
  onDecline: () => void;
  onManage: () => void;
  onView: () => void;
  accepting: boolean;
  declining: boolean;
}) {
  const name = d.delegator_profile?.display_name?.trim() || d.delegator_profile?.username || "—";
  const handle = d.delegator_profile?.username ? `@${d.delegator_profile.username}` : null;
  const presetKey = presetTitleKey(d.preset);
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <Avatar
          url={d.delegator_profile?.avatar_url ?? null}
          fallbackSeed={name}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-zinc-900">{name}</span>
            {handle && <span className="text-xs text-zinc-500">{handle}</span>}
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${statusToneClasses(d.status)}`}>
              {t(d.status === "pending"
                ? "delegation.tabPending"
                : d.status === "active"
                ? "delegation.tabActive"
                : "delegation.tabClosed")}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-600">{scopeText(d, t)}</p>
          {presetKey && (
            <p className="mt-0.5 text-xs text-zinc-500">{t(presetKey)}</p>
          )}
          {dateLabel(d, t) && (
            <p className="mt-0.5 text-[11px] text-zinc-400">{dateLabel(d, t)}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onView}
          className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
        >
          {t("delegation.actionViewPermissions")}
        </button>
        {d.status === "pending" && (
          <>
            <button
              type="button"
              onClick={onDecline}
              disabled={declining}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
            >
              {declining ? "…" : t("delegation.decline")}
            </button>
            <button
              type="button"
              onClick={onAccept}
              disabled={accepting}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {accepting ? "…" : t("delegation.accept")}
            </button>
          </>
        )}
        {d.status === "active" && (
          <button
            type="button"
            onClick={onManage}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
          >
            {t("delegation.actionManage")}
          </button>
        )}
      </div>
    </article>
  );
}

function SentCard({
  d, t, onView,
}: {
  d: DelegationWithDetails;
  t: (k: string) => string;
  onView: () => void;
}) {
  const to =
    d.delegate_profile?.display_name?.trim() ||
    (d.delegate_profile?.username ? `@${d.delegate_profile.username}` : null) ||
    d.delegate_email;
  const presetKey = presetTitleKey(d.preset);
  const statusLabel =
    d.status === "pending"
      ? t("delegation.sentBadgePending")
      : d.status === "active"
      ? t("delegation.sentBadgeActive")
      : t("delegation.sentBadgeClosed");
  return (
    <article className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4">
      <Avatar
        url={d.delegate_profile?.avatar_url ?? null}
        fallbackSeed={to ?? "?"}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm font-semibold text-zinc-900">{to}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusToneClasses(d.status)}`}>
            {statusLabel}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-600">{scopeText(d, t)}</p>
        {presetKey && (
          <p className="mt-0.5 text-xs text-zinc-500">{t(presetKey)}</p>
        )}
        {dateLabel(d, t) && (
          <p className="mt-0.5 text-[11px] text-zinc-400">{dateLabel(d, t)}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onView}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
      >
        {t("delegation.actionViewPermissions")}
      </button>
    </article>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useT();
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-6">
      <p className="text-base font-semibold text-zinc-900">{t("delegation.empty.headline")}</p>
      <p className="mt-1 text-sm text-zinc-600">{t("delegation.empty.body")}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-semibold text-zinc-900">{t("delegation.empty.cardAccount.title")}</p>
          <p className="mt-1 text-xs text-zinc-600">{t("delegation.empty.cardAccount.body")}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-semibold text-zinc-900">{t("delegation.empty.cardProject.title")}</p>
          <p className="mt-1 text-xs text-zinc-600">{t("delegation.empty.cardProject.body")}</p>
        </article>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
      >
        {t("delegation.cta.create")}
      </button>
    </div>
  );
}

function Avatar({ url, fallbackSeed }: { url: string | null; fallbackSeed: string }) {
  const resolved = url
    ? url.startsWith("http")
      ? url
      : getArtworkImageUrl(url, "avatar")
    : null;
  if (resolved) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolved} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-medium text-zinc-600">
      {(fallbackSeed ?? "?").charAt(0).toUpperCase()}
    </div>
  );
}
