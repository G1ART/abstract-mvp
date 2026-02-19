-- Add period_status parameter to upload-time claim creation RPCs.
-- When non-artist personas (gallery/curator) upload artworks with INVENTORY/CURATED/EXHIBITED claims,
-- they can specify whether the relationship is past/current/future.

-- 1) create_external_artist_and_claim: add optional period_status
create or replace function public.create_external_artist_and_claim(
  p_display_name text,
  p_claim_type text,
  p_work_id uuid default null,
  p_project_id uuid default null,
  p_website text default null,
  p_instagram text default null,
  p_invite_email text default null,
  p_visibility text default 'public',
  p_period_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ext_id uuid;
  v_claim_id uuid;
  v_ext_row jsonb;
  v_claim_row jsonb;
begin
  if v_uid is null then
    raise exception 'auth.uid() is null';
  end if;
  if nullif(trim(p_display_name), '') is null then
    raise exception 'display_name required';
  end if;
  if (p_work_id is null and p_project_id is null) or (p_work_id is not null and p_project_id is not null) then
    raise exception 'exactly one of work_id, project_id required';
  end if;
  if p_visibility is null then
    p_visibility := 'public';
  end if;
  -- Validate period_status if provided
  if p_period_status is not null and p_period_status not in ('past', 'current', 'future') then
    raise exception 'period_status must be past, current, or future';
  end if;

  insert into public.external_artists (display_name, website, instagram, invite_email, invited_by, status)
  values (trim(p_display_name), nullif(trim(p_website), ''), nullif(trim(p_instagram), ''), nullif(trim(p_invite_email), ''), v_uid, 'invited')
  returning id into v_ext_id;

  insert into public.claims (subject_profile_id, claim_type, work_id, project_id, external_artist_id, visibility, period_status)
  values (v_uid, p_claim_type, p_work_id, p_project_id, v_ext_id, p_visibility, p_period_status);

  select to_jsonb(e.*) into v_ext_row from public.external_artists e where e.id = v_ext_id;
  select to_jsonb(c.*) into v_claim_row from public.claims c where c.subject_profile_id = v_uid and c.external_artist_id = v_ext_id order by c.created_at desc limit 1;

  return jsonb_build_object('external_artist', v_ext_row, 'claim', v_claim_row);
end;
$$;

-- 2) create_claim_for_existing_artist: add optional period_status
create or replace function public.create_claim_for_existing_artist(
  p_artist_profile_id uuid,
  p_claim_type text,
  p_work_id uuid default null,
  p_project_id uuid default null,
  p_visibility text default 'public',
  p_period_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_claim_id uuid;
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
  -- Validate period_status if provided
  if p_period_status is not null and p_period_status not in ('past', 'current', 'future') then
    raise exception 'period_status must be past, current, or future';
  end if;

  insert into public.claims (subject_profile_id, claim_type, work_id, project_id, artist_profile_id, visibility, period_status)
  values (v_uid, p_claim_type, p_work_id, p_project_id, p_artist_profile_id, p_visibility, p_period_status)
  returning id into v_claim_id;

  select to_jsonb(c.*) into v_claim_row from public.claims c where c.id = v_claim_id;
  return jsonb_build_object('claim', v_claim_row);
end;
$$;

-- Update grants (signature changed)
drop function if exists public.create_external_artist_and_claim(text, text, uuid, uuid, text, text, text, text);
drop function if exists public.create_claim_for_existing_artist(uuid, text, uuid, uuid, text);

grant execute on function public.create_external_artist_and_claim(text, text, uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.create_claim_for_existing_artist(uuid, text, uuid, uuid, text, text) to authenticated;
