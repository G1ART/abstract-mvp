"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/useT";
import {
  PRESET_PERMISSIONS,
  getDelegationDetail,
  revokeDelegation,
  type DelegationDetail,
  type DelegationPreset,
} from "@/lib/supabase/delegations";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";

export type DelegationDetailDrawerProps = {
  delegationId: string | null;
  onClose: () => void;
  onChanged?: () => void;
  /**
   * Whether the *current viewer* is the delegator (owner). When true, the
   * "Revoke" CTA is rendered on active rows. Delegate-side viewers see a
   * read-only summary.
   */
  viewerIsOwner: boolean;
};

const DENIES_SHARED = [
  "delegation.deniesShared.login",
  "delegation.deniesShared.billing",
  "delegation.deniesShared.deleteAccount",
  "delegation.deniesShared.delegations",
] as const;

function presetTitleKey(p: DelegationPreset): string {
  switch (p) {
    case "operations": return "delegation.preset.operations.title";
    case "content": return "delegation.preset.content.title";
    case "review": return "delegation.preset.review.title";
    case "project_co_edit": return "delegation.preset.projectCoEdit.title";
    case "project_works_only": return "delegation.preset.projectWorksOnly.title";
    case "project_review": return "delegation.preset.projectReview.title";
  }
}

function formatDate(value: string | null | undefined, locale = "ko-KR"): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(locale, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export function DelegationDetailDrawer({
  delegationId,
  onClose,
  onChanged,
  viewerIsOwner,
}: DelegationDetailDrawerProps) {
  const { t } = useT();
  const [detail, setDetail] = useState<DelegationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    if (!delegationId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    getDelegationDetail(delegationId).then(({ data, error: err }) => {
      if (err) {
        setError(t("delegation.error.unknown"));
      } else {
        setDetail(data);
      }
      setLoading(false);
    });
  }, [delegationId, t]);

  const handleRevoke = useCallback(async () => {
    if (!detail) return;
    if (!confirm(t("delegation.detail.revokeConfirm"))) return;
    setRevoking(true);
    const { error: err } = await revokeDelegation(detail.delegation.id);
    setRevoking(false);
    if (err) {
      setError(t("delegation.error.unknown"));
      return;
    }
    onChanged?.();
    onClose();
  }, [detail, onChanged, onClose, t]);

  const open = !!delegationId;

  return (
    <div
      className={`fixed inset-0 z-40 transition-opacity ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("delegation.detail.title")}
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h3 className="text-base font-semibold text-zinc-900">{t("delegation.detail.title")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 text-sm">
          {loading && <p className="text-zinc-500">{t("common.loading")}</p>}
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}
          {detail && (
            <DetailBody t={t} detail={detail} viewerIsOwner={viewerIsOwner} />
          )}
        </div>

        {detail && viewerIsOwner && detail.delegation.status === "active" && (
          <footer className="border-t border-zinc-100 px-5 py-3">
            <button
              type="button"
              onClick={handleRevoke}
              disabled={revoking}
              className="w-full rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {revoking ? t("delegation.detail.revoking") : t("delegation.revoke")}
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

function DetailBody({
  t, detail, viewerIsOwner,
}: { t: (k: string) => string; detail: DelegationDetail; viewerIsOwner: boolean }) {
  const d = detail.delegation;
  const counterpart = viewerIsOwner ? detail.delegate_profile : detail.delegator_profile;
  const counterpartLabel =
    counterpart?.display_name?.trim() ||
    (counterpart?.username ? `@${counterpart.username}` : null) ||
    d.delegate_email ||
    "—";

  const scopeLabel =
    d.scope_type === "project"
      ? detail.project?.title
        ? t("delegation.scopeExhibitionPrefix").replace("{title}", detail.project.title)
        : t("delegation.scopeProject")
      : t("delegation.scopeAccount");

  const presetLabel = d.preset ? t(presetTitleKey(d.preset)) : "—";
  const permissions = d.preset
    ? PRESET_PERMISSIONS[d.preset]
    : d.permissions ?? [];

  return (
    <>
      <section className="mb-5 flex items-center gap-3 rounded-lg bg-zinc-50 px-3 py-3">
        <Avatar profile={counterpart} email={d.delegate_email} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-900">{counterpartLabel}</p>
          <p className="truncate text-xs text-zinc-500">{scopeLabel}</p>
        </div>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${statusToneClasses(d.status)}`}>
          {t(statusKey(d.status))}
        </span>
      </section>

      <section className="mb-5">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          {t("delegation.detail.presetLabel")}
        </p>
        <p className="text-sm text-zinc-800">{presetLabel}</p>
      </section>

      <section className="mb-5">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          {t("delegation.detail.canDo")}
        </p>
        <ul className="space-y-1 text-sm text-zinc-700">
          {(permissions ?? []).map((p) => (
            <li key={p}>· {t(`delegation.permissionLabel.${p}`)}</li>
          ))}
          {(!permissions || permissions.length === 0) && (
            <li className="text-zinc-400">—</li>
          )}
        </ul>
      </section>

      <section className="mb-5">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          {t("delegation.detail.cannotShare")}
        </p>
        <ul className="space-y-1 text-sm text-zinc-700">
          {DENIES_SHARED.map((k) => (
            <li key={k}>· {t(k)}</li>
          ))}
        </ul>
      </section>

      {d.note && (
        <section className="mb-5">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            {t("delegation.detail.noteLabel")}
          </p>
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-800">{d.note}</p>
        </section>
      )}

      <section className="mb-5">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          {t("delegation.detail.timeline")}
        </p>
        <ul className="space-y-1 text-sm text-zinc-700">
          {d.invited_at && (
            <li>· {t("delegation.dateInvited").replace("{date}", formatDate(d.invited_at))}</li>
          )}
          {d.accepted_at && (
            <li>· {t("delegation.dateAccepted").replace("{date}", formatDate(d.accepted_at))}</li>
          )}
          {d.declined_at && (
            <li>· {t("delegation.dateDeclined").replace("{date}", formatDate(d.declined_at))}</li>
          )}
          {d.revoked_at && (
            <li>· {t("delegation.dateRevoked").replace("{date}", formatDate(d.revoked_at))}</li>
          )}
        </ul>
      </section>

      {detail.events.length > 0 && (
        <section className="mb-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            {t("delegation.detail.recentActivity")}
          </p>
          <ul className="space-y-1.5 text-sm text-zinc-700">
            {detail.events.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3">
                <span className="truncate">{t(`delegation.event.${e.event_type}`)}</span>
                <span className="shrink-0 text-xs text-zinc-400">{formatDate(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function statusKey(status: string): string {
  switch (status) {
    case "pending": return "delegation.tabPending";
    case "active": return "delegation.tabActive";
    default: return "delegation.tabClosed";
  }
}

function statusToneClasses(status: string): string {
  switch (status) {
    case "pending": return "bg-amber-100 text-amber-900";
    case "active": return "bg-emerald-100 text-emerald-900";
    default: return "bg-zinc-200 text-zinc-700";
  }
}

function Avatar({
  profile, email,
}: { profile: DelegationDetail["delegator_profile"] | DelegationDetail["delegate_profile"]; email?: string | null }) {
  const url = profile?.avatar_url
    ? profile.avatar_url.startsWith("http")
      ? profile.avatar_url
      : getArtworkImageUrl(profile.avatar_url, "avatar")
    : null;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-10 w-10 rounded-full object-cover" />;
  }
  const seed = profile?.display_name ?? profile?.username ?? email ?? "?";
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200 text-sm font-medium text-zinc-600">
      {seed.charAt(0).toUpperCase()}
    </div>
  );
}
