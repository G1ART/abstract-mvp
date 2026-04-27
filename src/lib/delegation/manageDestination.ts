/**
 * Delegation manage-destination resolver (PR-B).
 *
 * The "Manage" CTA on a received delegation card historically routed
 * every project-scope delegation to `/my/exhibitions/{id}/add`. That
 * was wrong for two reasons:
 *
 *   1. `project_review` is intentionally view-only. Dropping the user
 *      onto an `/add` route encouraged them to start mutations they
 *      had no permission for, surfacing RLS-denied errors only after
 *      they tried to save.
 *   2. `project_co_edit` includes metadata edit rights but `/add` is
 *      narrowly scoped to adding works. Co-editors should land on the
 *      full edit surface where they can fix copy / dates / etc.
 *
 * This helper centralises the routing decision so the hub page,
 * notification deep-links, and any future entry points stay consistent.
 *
 * Returns:
 *   - `kind: "navigate"`: the caller should activate acting-as (when
 *     `activateActingAs=true`) and navigate to `href`.
 *   - `kind: "stay"`: the caller should NOT activate acting-as. Show
 *     the message at `messageKey` inline (review presets, where there
 *     are no mutation surfaces, fall here).
 */

import type {
  DelegationPreset,
  DelegationWithDetails,
} from "@/lib/supabase/delegations";

export type ManageDestination =
  | { kind: "navigate"; href: string; activateActingAs: boolean }
  | { kind: "stay"; messageKey: string };

/**
 * Heuristic: does this preset grant ANY mutation rights?
 * `view`-only presets (`project_review`, `account_review`) return false.
 */
export function presetHasMutationRights(
  preset: DelegationPreset | null | undefined
): boolean {
  if (!preset) return false;
  switch (preset) {
    case "review":
    case "project_review":
      return false;
    case "operations":
    case "content":
    case "project_co_edit":
    case "project_works_only":
      return true;
  }
}

export function resolveManageDestination(
  d: Pick<DelegationWithDetails, "scope_type" | "project_id" | "preset">
): ManageDestination {
  if (d.scope_type === "project") {
    if (!d.project_id) {
      return { kind: "stay", messageKey: "delegation.manage.missingProject" };
    }
    switch (d.preset) {
      case "project_review":
        // View-only — there is no curator-side surface to land on.
        // The hub already shows the title/preset; we surface a friendly
        // note and let the user explore via the public exhibition link
        // surfaced in the detail drawer.
        return { kind: "stay", messageKey: "delegation.manage.reviewOnly" };
      case "project_works_only":
        return {
          kind: "navigate",
          href: `/my/exhibitions/${d.project_id}/add`,
          activateActingAs: true,
        };
      case "project_co_edit":
        return {
          kind: "navigate",
          href: `/my/exhibitions/${d.project_id}/edit`,
          activateActingAs: true,
        };
      default:
        // Legacy / unknown preset: treat as co-edit so users with rows
        // created before presets existed don't get stuck. RLS will
        // still gate any mutation attempts.
        return {
          kind: "navigate",
          href: `/my/exhibitions/${d.project_id}/edit`,
          activateActingAs: true,
        };
    }
  }

  // account scope
  switch (d.preset) {
    case "review":
      return { kind: "stay", messageKey: "delegation.manage.reviewOnly" };
    case "operations":
    case "content":
      return { kind: "navigate", href: "/my", activateActingAs: true };
    default:
      // Legacy account delegation: keep prior behaviour (acting-as on,
      // land in My Studio). Permission-aware RLS now guards mutations.
      return { kind: "navigate", href: "/my", activateActingAs: true };
  }
}
