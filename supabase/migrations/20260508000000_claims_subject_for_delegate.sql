-- QA 2026-04-28 (acting-as upload bug, CRITICAL)
--
-- Problem
--   When an account-scope delegate uploads a new artwork from their
--   *operator* session while acting-as the *principal*, the artwork's
--   `artist_id` is correctly stamped as the principal (RLS allows this
--   via `is_active_account_delegate_writer`), but the *claim* row was
--   always inserted with `subject_profile_id = auth.uid()` (the
--   operator). The artist's public profile / studio surfaces filter
--   on either `artist_id` *or* the `subject_profile_id` of a
--   `CREATED` claim, so:
--     - the artwork lands on the principal's profile via artist_id, BUT
--     - it ALSO lands on the operator's profile via the misplaced claim,
--     - and downstream surfaces that join through claims (e.g. provenance
--       cards, stats) resolve to the operator instead of the principal.
--
-- Fix
--   Both `create_claim_for_existing_artist` and
--   `create_external_artist_and_claim` accept an optional
--   `p_subject_profile_id`. When supplied AND different from
--   `auth.uid()`, the function verifies the caller holds an active
--   account-scope delegation against that subject WITH at least one
--   mutating permission, via the existing
--   `is_active_account_delegate_writer(owner)` helper.
--
-- Backwards compatibility
--   The default value is NULL, which preserves the historical behaviour
--   (subject = caller). Existing callers do not need to change. Only
--   callers that genuinely act on behalf of another profile pass the
--   override, and only after the writer check passes.
--
-- Safety
--   - SECURITY DEFINER bypasses RLS by design; the new gate replicates
--     the equivalent of the RLS WITH CHECK for the override path.
--   - No other call sites of these RPCs are altered. RLS on `claims`
--     remains the same.

begin;

-- 1) create_claim_for_existing_artist + p_subject_profile_id
create or replace function public.create_claim_for_existing_artist(
  p_artist_profile_id  uuid,
  p_claim_type         text,
  p_work_id            uuid default null,
  p_project_id         uuid default null,
  p_visibility         text default 'public',
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
  if p_artist_profile_id is null then
    raise exception 'artist_profile_id required';
  end if;
  if (p_work_id is null and p_project_id is null) or (p_work_id is not null and p_project_id is not null) then
    raise exception 'exactly one of work_id, project_id required';
  end if;
  if p_visibility is null then
    p_visibility := 'public';
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
    subject_profile_id, claim_type, work_id, project_id,
    artist_profile_id, visibility, period_status
  )
  values (
    v_subject, p_claim_type, p_work_id, p_project_id,
    p_artist_profile_id, p_visibility, p_period_status
  )
  returning id into v_claim_id;

  select to_jsonb(c.*) into v_claim_row from public.claims c where c.id = v_claim_id;
  return jsonb_build_object('claim', v_claim_row);
end;
$$;

-- 2) create_external_artist_and_claim + p_subject_profile_id
create or replace function public.create_external_artist_and_claim(
  p_display_name      text,
  p_invite_email      text default null,
  p_work_id           uuid default null,
  p_project_id        uuid default null,
  p_claim_type        text default 'OWNS',
  p_website           text default null,
  p_instagram         text default null,
  p_visibility        text default 'public',
  p_period_status     text default null,
  p_subject_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_subject    uuid;
  v_ext_id     uuid;
  v_ext_row    jsonb;
  v_claim_row  jsonb;
begin
  if v_uid is null then
    raise exception 'auth.uid() is null';
  end if;
  if p_display_name is null or length(trim(p_display_name)) < 2 then
    raise exception 'display_name must be at least 2 characters';
  end if;
  if (p_work_id is null and p_project_id is null) or (p_work_id is not null and p_project_id is not null) then
    raise exception 'exactly one of work_id, project_id required';
  end if;
  if p_visibility is null then
    p_visibility := 'public';
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

  insert into public.external_artists (display_name, website, instagram, invite_email, invited_by, status)
  values (trim(p_display_name), nullif(trim(p_website), ''), nullif(trim(p_instagram), ''), nullif(trim(p_invite_email), ''), v_uid, 'invited')
  returning id into v_ext_id;

  insert into public.claims (
    subject_profile_id, claim_type, work_id, project_id,
    external_artist_id, visibility, period_status
  )
  values (
    v_subject, p_claim_type, p_work_id, p_project_id,
    v_ext_id, p_visibility, p_period_status
  );

  select to_jsonb(e.*) into v_ext_row from public.external_artists e where e.id = v_ext_id;
  select to_jsonb(c.*) into v_claim_row
    from public.claims c
   where c.subject_profile_id = v_subject
     and c.external_artist_id = v_ext_id
   order by c.created_at desc
   limit 1;

  return jsonb_build_object('external_artist', v_ext_row, 'claim', v_claim_row);
end;
$$;

-- Refresh grants for the new signatures (Postgres treats different default
-- arity as overloads; we drop the prior 6-arg / 9-arg shapes only if they
-- still exist, then re-grant the new shape).
do $$
begin
  -- create_claim_for_existing_artist: prior 6-arg shape (without subject)
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_claim_for_existing_artist'
      and p.pronargs = 6
  ) then
    execute 'drop function public.create_claim_for_existing_artist(uuid, text, uuid, uuid, text, text)';
  end if;

  -- create_external_artist_and_claim: prior 9-arg shape (without subject)
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_external_artist_and_claim'
      and p.pronargs = 9
  ) then
    execute 'drop function public.create_external_artist_and_claim(text, text, uuid, uuid, text, text, text, text, text)';
  end if;
end $$;

grant execute on function public.create_claim_for_existing_artist(uuid, text, uuid, uuid, text, text, uuid)
  to authenticated;
grant execute on function public.create_external_artist_and_claim(text, text, uuid, uuid, text, text, text, text, text, uuid)
  to authenticated;

commit;
