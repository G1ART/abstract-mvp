-- Acting-as persona hardening — PR1
--
-- Two additive surfaces close acting-as gaps that are not covered by the
-- earlier delegation hardening waves:
--
--   1. `create_claim_request` RPC. Public artwork pages let a viewer raise
--      a "pending" claim ("I own this", "We exhibited this"). The
--      historical helper (`createClaimRequest` in TS) inserted directly
--      with `subject_profile_id = auth.uid()`, so a delegate operating on
--      behalf of a principal would attribute the claim to themselves
--      instead of the principal. This RPC mirrors the QA3 pattern from
--      `20260508000000_claims_subject_for_delegate.sql` and accepts an
--      optional `p_subject_profile_id`. When provided AND different from
--      `auth.uid()`, the function verifies the caller holds an active
--      account-scope delegation with at least one mutating permission via
--      `is_active_account_delegate_writer(owner)`.
--
--   2. Shortlists (boards) RLS + helpers. The original
--      `shortlists_owner_all` policy locks INSERT/UPDATE/DELETE/SELECT to
--      `owner_id = auth.uid()`. Acting-as scope (per product decision
--      2026-04-28) makes boards a *principal-side* surface, so a writer
--      delegate must be able to create / read / update / delete the
--      principal's shortlists. We add four additive permissive policies
--      gated on `is_active_account_delegate_writer(owner_id)` and a
--      SECURITY DEFINER helper `is_shortlist_owned_by_account_delegate`
--      so cascading policies on `shortlist_items` /
--      `shortlist_collaborators` / `shortlist_views` can avoid recursive
--      RLS lookups (same pattern as `is_shortlist_owner`).
--
-- Backwards compatibility
--   - The new RPC defaults `p_subject_profile_id` to NULL → preserves the
--     historical behaviour (subject = caller).
--   - Existing `shortlists_owner_all` policy is untouched. PERMISSIVE
--     policies are OR-ed in Postgres so adding new policies cannot revoke
--     access for solo owners; it only widens the surface for the active
--     delegate path.
--   - No schema changes. Existing rows are unaffected.
--
-- Idempotent: safe to re-run. RPCs use `create or replace`; policies use
-- `drop policy if exists … create policy …`.

begin;

-- ─────────────────── 1) create_claim_request RPC ───────────────────

create or replace function public.create_claim_request(
  p_work_id            uuid,
  p_claim_type         text,
  p_artist_profile_id  uuid,
  p_period_status      text default null,
  p_subject_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_subject   uuid;
  v_claim_id  uuid;
  v_claim_row jsonb;
begin
  if v_uid is null then
    raise exception 'auth.uid() is null';
  end if;
  if p_work_id is null then
    raise exception 'work_id required';
  end if;
  if p_claim_type is null or length(trim(p_claim_type)) = 0 then
    raise exception 'claim_type required';
  end if;
  if p_artist_profile_id is null then
    raise exception 'artist_profile_id required';
  end if;
  if p_period_status is not null and p_period_status not in ('past', 'current', 'future') then
    raise exception 'period_status must be past, current, or future';
  end if;

  v_subject := coalesce(p_subject_profile_id, v_uid);
  if v_subject <> v_uid then
    if not public.is_active_account_delegate_writer(v_subject) then
      raise exception 'forbidden: caller is not an active account delegate writer for subject_profile_id';
    end if;
  end if;

  insert into public.claims (
    subject_profile_id, claim_type, work_id,
    artist_profile_id, visibility, status, period_status
  )
  values (
    v_subject, p_claim_type, p_work_id,
    p_artist_profile_id, 'public', 'pending', p_period_status
  )
  returning id into v_claim_id;

  select to_jsonb(c.*) into v_claim_row from public.claims c where c.id = v_claim_id;
  return jsonb_build_object('claim', v_claim_row);
end;
$$;

grant execute on function public.create_claim_request(uuid, text, uuid, text, uuid)
  to authenticated;

-- ─────────────────── 2) shortlists delegate writer ───────────────────

-- Helper (mirrors `is_shortlist_owner` but for account-scope delegate
-- writers). SECURITY DEFINER bypasses recursive RLS while reading the
-- shortlists row.
create or replace function public.is_shortlist_owned_by_account_delegate(_sid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shortlists s
    where s.id = _sid
      and public.is_active_account_delegate_writer(s.owner_id)
  );
$$;

revoke all on function public.is_shortlist_owned_by_account_delegate(uuid) from public;
grant execute on function public.is_shortlist_owned_by_account_delegate(uuid) to authenticated;

-- shortlists: additive policies gated on writer delegation.
drop policy if exists shortlists_select_account_delegate on public.shortlists;
create policy shortlists_select_account_delegate on public.shortlists
  for select to authenticated
  using (public.is_active_account_delegate_writer(owner_id));

drop policy if exists shortlists_insert_account_delegate on public.shortlists;
create policy shortlists_insert_account_delegate on public.shortlists
  for insert to authenticated
  with check (public.is_active_account_delegate_writer(owner_id));

drop policy if exists shortlists_update_account_delegate on public.shortlists;
create policy shortlists_update_account_delegate on public.shortlists
  for update to authenticated
  using (public.is_active_account_delegate_writer(owner_id))
  with check (public.is_active_account_delegate_writer(owner_id));

drop policy if exists shortlists_delete_account_delegate on public.shortlists;
create policy shortlists_delete_account_delegate on public.shortlists
  for delete to authenticated
  using (public.is_active_account_delegate_writer(owner_id));

-- shortlist_items: additive policy via the helper above.
drop policy if exists shortlist_items_account_delegate on public.shortlist_items;
create policy shortlist_items_account_delegate on public.shortlist_items
  for all to authenticated
  using (public.is_shortlist_owned_by_account_delegate(shortlist_id))
  with check (public.is_shortlist_owned_by_account_delegate(shortlist_id));

-- shortlist_collaborators: only the owner-or-delegate may manage
-- collaborator membership; viewer/editor entries are still controlled by
-- the existing `shortlist_collab_self_select` flat predicate.
drop policy if exists shortlist_collab_account_delegate on public.shortlist_collaborators;
create policy shortlist_collab_account_delegate on public.shortlist_collaborators
  for all to authenticated
  using (public.is_shortlist_owned_by_account_delegate(shortlist_id))
  with check (public.is_shortlist_owned_by_account_delegate(shortlist_id));

-- shortlist_views: owner-side view log readable by the delegate so the
-- principal's "who-viewed" insights stay coherent during acting-as.
drop policy if exists shortlist_views_account_delegate on public.shortlist_views;
create policy shortlist_views_account_delegate on public.shortlist_views
  for select to authenticated
  using (public.is_shortlist_owned_by_account_delegate(shortlist_id));

commit;
