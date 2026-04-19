/**
 * Identity SSOT (Track 2.1)
 *
 * Every surface that shows a person's name / handle / role set should read
 * from this module instead of ad-hoc `display_name || username || ...` logic.
 * That way the rules ship from one place and stay consistent across Header,
 * feed cards, people lanes, artwork pages, notifications, delegation
 * banners, etc.
 */

import type { RoleKey } from "./roles";
import { normalizeRoleList, roleLabel } from "./roles";

export type IdentityInput = {
  id?: string | null;
  display_name?: string | null;
  username?: string | null;
  main_role?: string | null;
  roles?: string[] | null;
};

/** Anything we render for unknown users. Never throws, never returns ''. */
const UNKNOWN = "알 수 없는 사용자";

function cleanStr(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim();
}

/** Returns "@username" or "" when there is no username. */
export function formatUsername(profile: IdentityInput | null | undefined): string {
  const u = cleanStr(profile?.username);
  if (!u) return "";
  return `@${u.replace(/^@+/, "")}`;
}

/** The single line to show as the person's primary name.
 *  Preference order: display_name → @username → fallback. */
export function formatDisplayName(profile: IdentityInput | null | undefined): string {
  const dn = cleanStr(profile?.display_name);
  if (dn) return dn;
  const u = formatUsername(profile);
  if (u) return u;
  return UNKNOWN;
}

/**
 * Primary + secondary identity pair for hero/card layouts.
 *   primary   = display_name (falls back to @handle)
 *   secondary = @handle (only if we already used display_name as primary)
 * If we only have a handle we collapse to `{primary: '@handle', secondary: ''}`.
 */
export function formatIdentityPair(
  profile: IdentityInput | null | undefined
): { primary: string; secondary: string } {
  const dn = cleanStr(profile?.display_name);
  const handle = formatUsername(profile);
  if (dn && handle) return { primary: dn, secondary: handle };
  if (dn) return { primary: dn, secondary: "" };
  if (handle) return { primary: handle, secondary: "" };
  return { primary: UNKNOWN, secondary: "" };
}

export type IdentityRoleChip = {
  key: RoleKey;
  label: string;
  isPrimary: boolean;
};

/** Ordered role chips: primary first, then additional unique roles. */
export function formatRoleChips(
  profile: IdentityInput | null | undefined,
  t: (key: string) => string,
  options?: { max?: number }
): IdentityRoleChip[] {
  const max = options?.max ?? 4;
  const roles = normalizeRoleList(profile?.roles);
  const primaryRaw = cleanStr(profile?.main_role).toLowerCase();
  const primary = (roles.includes(primaryRaw as RoleKey) ? primaryRaw : roles[0] ?? null) as RoleKey | null;

  const ordered: RoleKey[] = [];
  if (primary) ordered.push(primary);
  for (const r of roles) {
    if (r !== primary && !ordered.includes(r)) ordered.push(r);
  }

  return ordered.slice(0, max).map((key, i) => ({
    key,
    label: roleLabel(key, t),
    isPrimary: i === 0 && !!primary,
  }));
}

/** Acting-as banner label (delegate operating another profile).
 *  Ex: "Acting as @gallery-foo (작가 위임)" */
export function formatActingAsLabel(
  subject: IdentityInput | null | undefined,
  t: (key: string) => string
): string {
  const name = formatDisplayName(subject);
  const handle = formatUsername(subject);
  const suffix = handle && handle !== name ? ` ${handle}` : "";
  return `${t("identity.actingAs")}: ${name}${suffix}`;
}
