# Abstract Mega Upgrade — Release Notes

Branch: `feature/abstract-mega-upgrade-profile-first`
Window: 2026‑04‑18

This patch tightens trust boundaries, rewrites the member shell around
the public profile, and makes identity/role/recommendation rendering
consistent everywhere. No migrations were destructive; all policy
rewrites are additive or replacements of previously permissive rules.

## Acceptance criteria (10)

1. **No public write on `artworks` bucket.**
   Proof: `supabase/migrations/20260419063001_p0_wave3_storage_policies.sql`
   rewrites all storage policies via `public.can_manage_artworks_storage_path`.
   RLS smoke (`supabase/tests/p0_rls_matrix.sql`) rejects anonymous delete.

2. **Private profile cannot be read by another user.**
   Proof: `20260419063002_p0_wave3_profiles_rls.sql` removes
   `profiles_select_self USING(true)` and adds
   `profiles_read_public_or_self` that evaluates `is_public` or `auth.uid()`.

3. **RLS typos do not block legitimate access.**
   Proof: `20260419063003_p0_wave3_shortlist_project_fixes.sql` replaces
   self‑join `shortlists_collab_select` and
   `projects_update_curator_or_delegate` with correctly scoped
   `EXISTS` subqueries.

4. **Client never claims auth state without server confirmation.**
   Proof: `20260419063004_p0_wave3_auth_state_rpc.sql` adds
   `get_my_auth_state()`. All seven client call sites
   (`src/lib/supabase/auth.ts`, `AuthGate`, `/`, `/set-password`,
   `/auth/callback`, `/login`, `/onboarding`) consume the RPC.

5. **Identity is rendered through a single formatter.**
   Proof: `src/lib/identity/format.ts` exposes `formatDisplayName`,
   `formatUsername`, `formatIdentityPair`, `formatRoleChips`. Used by
   feed cards, people client, onboarding preview, studio hero,
   notifications, claims and delegations.

6. **Roles and recommendation reasons are human‑readable and i18n‑safe.**
   Proof: `src/lib/identity/roles.ts` + `role.*` keys in
   `src/lib/i18n/messages.ts`; `src/lib/people/reason.ts` +
   `people.reason.*` keys. `follow_graph` etc. never reach the DOM.

7. **Studio is the top of `/my`.**
   Proof: `src/components/studio/*` rendered ahead of the existing
   portfolio blocks; priority engine in `src/lib/studio/priority.ts`
   decides which of up to four next actions to show.

8. **Onboarding is a one‑flow with live validation and a live preview.**
   Proof: `src/app/onboarding/page.tsx` — debounced availability check
   (350 ms), username status chip, public/private toggle, identity
   preview card using the shared formatter.

9. **Delegated activity is attributed on every page via a single banner.**
   Proof: `src/components/ActingAsBanner.tsx` mounted in `src/app/layout.tsx`;
   per‑page acting‑as banners are retired. `my/delegations` uses
   stage chips (Invitation → Acting as → Closed).

10. **Debug surfaces are blocked in production.**
    Proof: `middleware.ts` returns 404 for `/debug-schema` and
    `/my/diagnostics` when `NODE_ENV === "production"` unless
    `NEXT_PUBLIC_DIAGNOSTICS === "1"` is set.

## Migrations to apply (in order)

```
supabase/migrations/20260419063001_p0_wave3_storage_policies.sql
supabase/migrations/20260419063002_p0_wave3_profiles_rls.sql
supabase/migrations/20260419063003_p0_wave3_shortlist_project_fixes.sql
supabase/migrations/20260419063004_p0_wave3_auth_state_rpc.sql
```

Run `npx supabase db push` against the linked project.

## QA commands

```bash
npx tsc --noEmit
npm run build
npm run test   # vitest (auth-gate.test.ts)
npx playwright test  # smoke.spec.ts + auth-gate.spec.ts
psql $SUPABASE_DB_URL -f supabase/tests/p0_rls_matrix.sql
```

## Rollback plan

Each migration stands on its own. To roll back, restore the previous
policy set captured in `audit/remote_schema_snapshot_20260419050631.sql`
for the affected tables; code changes are backward compatible when the
policies are restored.
