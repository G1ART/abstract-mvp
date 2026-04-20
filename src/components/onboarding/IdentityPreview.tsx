"use client";

/**
 * IdentityPreview — live miniature of how the user's profile header
 * will appear once saved (Onboarding Identity Overhaul, Track H).
 *
 * Reads only the data the onboarding identity form controls so it
 * cannot drift from what we actually persist: display_name, username,
 * main_role + roles, is_public.
 */

import { useT } from "@/lib/i18n/useT";
import { formatRoleChips } from "@/lib/identity/format";
import { isPlaceholderUsername } from "@/lib/identity/placeholder";

type Props = {
  displayName: string;
  username: string;
  mainRole: string;
  roles: string[];
  isPublic: boolean;
};

export function IdentityPreview({
  displayName,
  username,
  mainRole,
  roles,
  isPublic,
}: Props) {
  const { t } = useT();
  const trimmedName = displayName.trim();
  const trimmedUsername = username.trim().toLowerCase();
  const isPlaceholder = isPlaceholderUsername(trimmedUsername);

  const chips = formatRoleChips(
    { main_role: mainRole || null, roles },
    t,
    { max: 3 }
  );

  const showUsername = trimmedUsername && !isPlaceholder;
  const initial =
    (trimmedName || trimmedUsername || "?").charAt(0).toUpperCase();

  return (
    <section
      aria-label={t("identity.preview.title")}
      className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
    >
      <p className="mb-3 text-[11px] uppercase tracking-wide text-zinc-500">
        {t("identity.preview.title")}
      </p>
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-lg font-semibold text-zinc-600"
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-base font-semibold text-zinc-900">
              {trimmedName || t("identity.preview.emptyDisplay")}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                isPublic
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-zinc-200 text-zinc-700"
              }`}
            >
              {isPublic
                ? t("identity.preview.publicBadge")
                : t("identity.preview.privateBadge")}
            </span>
          </div>
          <p className="truncate text-sm text-zinc-500">
            {showUsername ? (
              <span>@{trimmedUsername}</span>
            ) : (
              <span className="italic">
                @{t("identity.preview.emptyUsername")}
              </span>
            )}
          </p>
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {chips.map((chip) => (
                <span
                  key={chip.key}
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    chip.isPrimary
                      ? "bg-zinc-900 text-white"
                      : "bg-white text-zinc-700 ring-1 ring-inset ring-zinc-200"
                  }`}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 truncate text-xs text-zinc-400">
            {t("identity.preview.url")}/@{showUsername ? trimmedUsername : t("identity.preview.emptyUsername")}
          </p>
        </div>
      </div>
    </section>
  );
}
