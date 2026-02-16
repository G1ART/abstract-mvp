-- Provenance v1: claims (relationship declarations)
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  subject_profile_id uuid not null references public.profiles(id),
  claim_type text not null,
  work_id uuid references public.artworks(id),
  project_id uuid references public.projects(id),
  artist_profile_id uuid references public.profiles(id),
  external_artist_id uuid references public.external_artists(id),
  visibility text not null default 'public',
  note text,
  created_at timestamptz default now(),
  constraint claims_work_or_project check (
    (work_id is not null and project_id is null) or (work_id is null and project_id is not null)
  )
);

create index if not exists idx_claims_work_id on public.claims(work_id);
create index if not exists idx_claims_project_id on public.claims(project_id);
create index if not exists idx_claims_subject_profile_id on public.claims(subject_profile_id);
create index if not exists idx_claims_claim_type on public.claims(claim_type);
create index if not exists idx_claims_visibility on public.claims(visibility);

alter table public.claims enable row level security;

drop policy if exists claims_insert_update_delete_owner on public.claims;
create policy claims_insert_update_delete_owner on public.claims
  for all
  to authenticated
  using (subject_profile_id = auth.uid())
  with check (subject_profile_id = auth.uid());

drop policy if exists claims_select_visibility_or_owner on public.claims;
create policy claims_select_visibility_or_owner on public.claims
  for select
  to public
  using (visibility = 'public' or subject_profile_id = auth.uid());

grant select, insert, update, delete on public.claims to authenticated;

-- RPC: create_external_artist_and_claim (required params first, then optional with defaults)
create or replace function public.create_external_artist_and_claim(
  p_display_name text,
  p_claim_type text,
  p_work_id uuid default null,
  p_project_id uuid default null,
  p_website text default null,
  p_instagram text default null,
  p_invite_email text default null,
  p_visibility text default 'public'
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

  insert into public.external_artists (display_name, website, instagram, invite_email, invited_by, status)
  values (trim(p_display_name), nullif(trim(p_website), ''), nullif(trim(p_instagram), ''), nullif(trim(p_invite_email), ''), v_uid, 'invited')
  returning id into v_ext_id;

  insert into public.claims (subject_profile_id, claim_type, work_id, project_id, external_artist_id, visibility)
  values (v_uid, p_claim_type, p_work_id, p_project_id, v_ext_id, p_visibility);

  select to_jsonb(e.*) into v_ext_row from public.external_artists e where e.id = v_ext_id;
  select to_jsonb(c.*) into v_claim_row from public.claims c where c.subject_profile_id = v_uid and c.external_artist_id = v_ext_id order by c.created_at desc limit 1;

  return jsonb_build_object('external_artist', v_ext_row, 'claim', v_claim_row);
end;
$$;

-- RPC: create_claim_for_existing_artist
create or replace function public.create_claim_for_existing_artist(
  p_artist_profile_id uuid,
  p_claim_type text,
  p_work_id uuid default null,
  p_project_id uuid default null,
  p_visibility text default 'public'
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

  insert into public.claims (subject_profile_id, claim_type, work_id, project_id, artist_profile_id, visibility)
  values (v_uid, p_claim_type, p_work_id, p_project_id, p_artist_profile_id, p_visibility)
  returning id into v_claim_id;

  select to_jsonb(c.*) into v_claim_row from public.claims c where c.id = v_claim_id;
  return jsonb_build_object('claim', v_claim_row);
end;
$$;

-- RPC: search_works_for_dedup (read-only)
-- For artist_profile_id: artworks where artist_id matches
-- For external_artist_id: artworks linked via claims
create or replace function public.search_works_for_dedup(
  p_artist_profile_id uuid default null,
  p_external_artist_id uuid default null,
  p_q text default null,
  p_limit int default 20
)
returns setof public.artworks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if p_artist_profile_id is not null then
    return query
    select a.* from public.artworks a
    where a.visibility = 'public' and a.artist_id = p_artist_profile_id
      and (p_q is null or nullif(trim(p_q), '') is null or a.title ilike '%' || trim(p_q) || '%')
    order by a.created_at desc limit v_limit;
  elsif p_external_artist_id is not null then
    return query
    select a.* from public.artworks a
    join public.claims c on c.work_id = a.id and c.external_artist_id = p_external_artist_id
    where a.visibility = 'public'
      and (p_q is null or nullif(trim(p_q), '') is null or a.title ilike '%' || trim(p_q) || '%')
    order by a.created_at desc limit v_limit;
  else
    return query
    select a.* from public.artworks a
    where a.visibility = 'public'
      and (p_q is null or nullif(trim(p_q), '') is null or a.title ilike '%' || trim(p_q) || '%')
    order by a.created_at desc limit v_limit;
  end if;
end;
$$;

grant execute on function public.create_external_artist_and_claim(text, text, uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.create_claim_for_existing_artist(uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.search_works_for_dedup(uuid, uuid, text, int) to authenticated;
