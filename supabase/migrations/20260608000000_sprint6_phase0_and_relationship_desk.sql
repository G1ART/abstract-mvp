-- Sprint 6 + Phase 0 Trust-Floor Closure.
--
-- Phase 0 (must close before Sprint 6 surfaces ship):
--   1. Re-emit the artwork passport DTO via explicit allowlists. The
--      Sprint 5.2 build still leaned on `to_jsonb(p)` for nested
--      profiles + external_artists rows, which echoed `is_public` and
--      (worse) `external_artists.invite_email` — a private invite
--      address — into every viewer-facing payload.
--   2. Add `resolve_room_source_from_token(text, uuid)` so the artwork
--      attribution path stops fetching full room metadata just to
--      extract the room id. The new RPC returns the absolute minimum
--      ({ room_id, source_surface }) and validates that the artwork
--      really belongs to that room before answering.
--
-- Sprint 6 surfaces:
--   3. `relationship_private_notes` table + RLS — owner/delegate-only.
--      Target user CANNOT read the note about themselves. Telemetry
--      may NEVER include the note body.
--   4. `upsert_relationship_private_note(uuid, text)` RPC.
--   5. `get_relationship_desk_for_owner(int, int, text)` RPC — calm
--      owner-only listing built from follows / access_requests /
--      access_grants / price_inquiries / notes. Owner-only DTO.
--   6. `get_relationship_card_for_owner(uuid)` RPC — single profile's
--      relationship card with grants, requests, inquiries, rooms, note.
--   7. `resolve_access_request_v2(...)` — additive, backwards-compatible
--      grant-lifecycle wrapper that lets the owner narrow the resulting
--      access_grant (subject_type / subject_id / field_key / expires_at).
--      The legacy `resolve_access_request(uuid, text)` keeps working.
--
-- Migration application:
--   This file contains multiple PL/pgSQL functions. Per
--   .cursor/rules/release-workflow.mdc §1-1, do NOT paste the whole
--   file into the Supabase dashboard at once. Run each
--   `-- == SECTION N == ...` block separately. Dollar tags are
--   letters-only ($a$, $accept$) for the same reason.

-- == SECTION 1 == get_artwork_passport_for_viewer (allowlisted DTO redaction)

create or replace function public.get_artwork_passport_for_viewer(
  p_artwork_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $a$
declare
  v_uid uuid := auth.uid();
  v_aw record;
  v_owner uuid;
  v_price jsonb;
  v_avail jsonb;
  v_desc jsonb;
  v_relationship jsonb;
  v_can_price boolean;
  v_can_avail boolean;
  v_can_desc boolean;
  v_artwork jsonb;
begin
  if p_artwork_id is null then
    return null;
  end if;

  select
    a.id, a.title, a.year, a.medium, a.size, a.size_unit, a.story,
    a.visibility, a.created_by, a.pricing_mode, a.is_price_public,
    a.price_usd, a.price_input_amount, a.price_input_currency,
    a.fx_rate_to_usd, a.fx_date, a.ownership_status, a.artist_id,
    a.artist_sort_order, a.created_at, a.provenance_visible
  into v_aw
  from public.artworks a
  where a.id = p_artwork_id;

  if v_aw.id is null then
    return null;
  end if;

  v_owner := v_aw.artist_id;

  -- Cast enum to text before coalescing — `coalesce(enum, '')` otherwise
  -- forces Postgres to cast the literal `''` *to* `artwork_visibility`,
  -- which fails (`invalid input value for enum artwork_visibility: ""`)
  -- and crashes every viewer regardless of relationship. See hotfix
  -- migration 20260609000000_artwork_passport_enum_cast_hotfix.sql.
  if coalesce(v_aw.visibility::text, '') <> 'public' then
    if v_uid is null
       or (v_uid <> v_owner
           and not public.is_active_account_delegate_writer(v_owner)) then
      return null;
    end if;
  end if;

  v_price := public.resolve_visibility_for_viewer(v_owner, 'artwork', v_aw.id, 'price');
  v_avail := public.resolve_visibility_for_viewer(v_owner, 'artwork', v_aw.id, 'availability');
  v_desc  := public.resolve_visibility_for_viewer(v_owner, 'artwork', v_aw.id, 'description');
  v_relationship := public.get_viewer_relationship_context(v_owner);

  v_can_price := coalesce((v_price->>'can_view')::boolean, false);
  v_can_avail := coalesce((v_avail->>'can_view')::boolean, false);
  v_can_desc  := coalesce((v_desc ->>'can_view')::boolean, false);

  v_artwork := jsonb_build_object(
    'id', v_aw.id,
    'title', v_aw.title,
    'year', v_aw.year,
    'medium', v_aw.medium,
    'size', v_aw.size,
    'size_unit', v_aw.size_unit,
    'visibility', v_aw.visibility,
    'created_by', v_aw.created_by,
    'artist_id', v_aw.artist_id,
    'artist_sort_order', v_aw.artist_sort_order,
    'created_at', v_aw.created_at,
    'provenance_visible', v_aw.provenance_visible,
    'ownership_status',     case when v_can_avail then v_aw.ownership_status     else null end,
    'pricing_mode',         case when v_can_price then v_aw.pricing_mode         else null end,
    'is_price_public',      case when v_can_price then v_aw.is_price_public      else null end,
    'price_usd',            case when v_can_price then v_aw.price_usd            else null end,
    'price_input_amount',   case when v_can_price then v_aw.price_input_amount   else null end,
    'price_input_currency', case when v_can_price then v_aw.price_input_currency else null end,
    'fx_rate_to_usd',       case when v_can_price then v_aw.fx_rate_to_usd       else null end,
    'fx_date',              case when v_can_price then v_aw.fx_date              else null end,
    'story',                case when v_can_desc  then v_aw.story                else null end,
    'artwork_images', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('storage_path', ai.storage_path, 'sort_order', ai.sort_order)
          order by ai.sort_order nulls last
        ),
        '[]'::jsonb
      )
      from public.artwork_images ai
      where ai.artwork_id = v_aw.id
    ),
    -- Phase 0 — explicit allowlist for the joined owner profile. The
    -- previous build used `to_jsonb(p)` which pulled `is_public` (an
    -- internal owner flag) into every viewer payload. Limit to the
    -- exact fields the public profile surface already exposes.
    'profiles', (
      select jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'bio', p.bio,
        'main_role', p.main_role,
        'roles', p.roles
      )
      from public.profiles p
      where p.id = v_owner
    ),
    'artwork_likes', (
      select jsonb_build_array(jsonb_build_object('count', count(*)))
      from public.artwork_likes al
      where al.artwork_id = v_aw.id
    ),
    -- Phase 0 — explicit allowlist for nested claim payloads. The
    -- previous build used `to_jsonb(ea)` for `external_artists`,
    -- which leaked `invite_email` (a private invitation address)
    -- to every viewer fetching this artwork. We now project only
    -- `display_name`, the field already shown publicly.
    'claims', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'claim_type', c.claim_type,
            'subject_profile_id', c.subject_profile_id,
            'artist_profile_id', c.artist_profile_id,
            'external_artist_id', c.external_artist_id,
            'created_at', c.created_at,
            'status', c.status,
            'period_status', c.period_status,
            'start_date', c.start_date,
            'end_date', c.end_date,
            'profiles', (
              select jsonb_build_object(
                'username', sp.username,
                'display_name', sp.display_name
              )
              from public.profiles sp
              where sp.id = c.subject_profile_id
            ),
            'external_artists', (
              select jsonb_build_object(
                'display_name', ea.display_name
              )
              from public.external_artists ea
              where ea.id = c.external_artist_id
            )
          )
          order by c.created_at desc
        ),
        '[]'::jsonb
      )
      from public.claims c
      where c.work_id = v_aw.id
    )
  );

  return jsonb_build_object(
    'artwork', v_artwork,
    'visibility', jsonb_build_object(
      'price', v_price,
      'availability', v_avail,
      'description', v_desc
    ),
    'presence', jsonb_build_object(
      'price', (
        v_aw.pricing_mode is not null
        or v_aw.price_usd is not null
        or v_aw.price_input_amount is not null
      ),
      'availability', (v_aw.ownership_status is not null),
      'description', (
        v_aw.story is not null
        and length(btrim(v_aw.story)) > 0
      )
    ),
    'relationship', v_relationship
  );
end;
$a$;

grant execute on function public.get_artwork_passport_for_viewer(uuid) to authenticated;
grant execute on function public.get_artwork_passport_for_viewer(uuid) to anon;

-- == SECTION 2 == resolve_room_source_from_token (attribution-safe)

-- Phase 0 — minimal attribution resolver. The artwork detail page used
-- `getRoomByToken` (the legacy full-row fetch) just to map a share
-- token back to its room id, which leaked the room title, description,
-- owner names and other private metadata into a viewer surface that
-- only needed the id. This RPC returns the absolute minimum and:
--   * silently returns null for malformed tokens (never echoes input);
--   * silently returns null for inactive / expired rooms;
--   * silently returns null when the artwork is NOT actually in the
--     room (defends against arbitrary `?fromRoom=token` inflation);
--   * returns ONLY { room_id, source_surface } when valid.
create or replace function public.resolve_room_source_from_token(
  p_token text,
  p_artwork_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $a$
declare
  v_token uuid;
  v_room_id uuid;
begin
  if p_token is null or length(p_token) = 0 or p_artwork_id is null then
    return jsonb_build_object('room_id', null, 'source_surface', null);
  end if;

  begin
    v_token := p_token::uuid;
  exception when others then
    return jsonb_build_object('room_id', null, 'source_surface', null);
  end;

  select s.id
    into v_room_id
  from public.shortlists s
  where s.share_token = v_token
    and coalesce(s.room_active, true) = true
    and (s.expires_at is null or s.expires_at > now());

  if v_room_id is null then
    return jsonb_build_object('room_id', null, 'source_surface', null);
  end if;

  if not exists (
    select 1
    from public.shortlist_items si
    where si.shortlist_id = v_room_id
      and si.artwork_id = p_artwork_id
  ) then
    return jsonb_build_object('room_id', null, 'source_surface', null);
  end if;

  return jsonb_build_object(
    'room_id', v_room_id,
    'source_surface', 'room'
  );
end;
$a$;

grant execute on function public.resolve_room_source_from_token(text, uuid) to authenticated;
grant execute on function public.resolve_room_source_from_token(text, uuid) to anon;

-- == SECTION 3 == relationship_private_notes (table + RLS)

create table if not exists public.relationship_private_notes (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  note text not null default '',
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint relationship_private_notes_no_self_note
    check (owner_profile_id <> target_profile_id),
  constraint relationship_private_notes_unique_pair
    unique (owner_profile_id, target_profile_id)
);

comment on table public.relationship_private_notes is
  'Owner/delegate-only private notes about a related profile. Target user MUST NOT read notes about themselves; note body MUST NEVER appear in telemetry.';

create index if not exists idx_relationship_private_notes_owner
  on public.relationship_private_notes (owner_profile_id, updated_at desc);

alter table public.relationship_private_notes enable row level security;

drop policy if exists relationship_private_notes_owner_select
  on public.relationship_private_notes;
drop policy if exists relationship_private_notes_owner_insert
  on public.relationship_private_notes;
drop policy if exists relationship_private_notes_owner_update
  on public.relationship_private_notes;
drop policy if exists relationship_private_notes_owner_delete
  on public.relationship_private_notes;

create policy relationship_private_notes_owner_select on public.relationship_private_notes
  for select to authenticated
  using (
    owner_profile_id = auth.uid()
    or public.is_active_account_delegate_writer(owner_profile_id)
  );

create policy relationship_private_notes_owner_insert on public.relationship_private_notes
  for insert to authenticated
  with check (
    (owner_profile_id = auth.uid()
     or public.is_active_account_delegate_writer(owner_profile_id))
    and owner_profile_id <> target_profile_id
  );

create policy relationship_private_notes_owner_update on public.relationship_private_notes
  for update to authenticated
  using (
    owner_profile_id = auth.uid()
    or public.is_active_account_delegate_writer(owner_profile_id)
  )
  with check (
    owner_profile_id = auth.uid()
    or public.is_active_account_delegate_writer(owner_profile_id)
  );

create policy relationship_private_notes_owner_delete on public.relationship_private_notes
  for delete to authenticated
  using (
    owner_profile_id = auth.uid()
    or public.is_active_account_delegate_writer(owner_profile_id)
  );

-- == SECTION 4 == upsert_relationship_private_note (RPC)

create or replace function public.upsert_relationship_private_note(
  p_target_profile_id uuid,
  p_note text
) returns public.relationship_private_notes
language plpgsql
security definer
set search_path = public
as $a$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_row public.relationship_private_notes;
  v_clean text;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if p_target_profile_id is null then
    raise exception 'target profile required';
  end if;

  -- The "owner" for note storage is the principal whose desk this is
  -- written to — i.e. auth.uid() itself. Delegate-writers writing on
  -- behalf of a principal go through `acting_as` flows that swap the
  -- session uid; we therefore use auth.uid() as the canonical owner.
  v_owner := v_uid;

  if v_owner = p_target_profile_id then
    raise exception 'cannot write a relationship note about yourself';
  end if;

  -- Bounded body. The owner UI also clamps client-side; this is the
  -- defensive server cap so a hostile client cannot stash megabytes.
  v_clean := coalesce(p_note, '');
  if length(v_clean) > 4000 then
    v_clean := substring(v_clean from 1 for 4000);
  end if;

  insert into public.relationship_private_notes (
    owner_profile_id, target_profile_id, note, created_by, updated_by
  ) values (
    v_owner, p_target_profile_id, v_clean, v_uid, v_uid
  )
  on conflict (owner_profile_id, target_profile_id)
  do update set
    note = excluded.note,
    updated_by = v_uid,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$a$;

grant execute on function public.upsert_relationship_private_note(uuid, text) to authenticated;

-- == SECTION 5 == get_relationship_desk_for_owner (RPC)

-- Owner-only relationship desk feed. Aggregates explicit relationship
-- signals (follows, access_requests, access_grants, price_inquiries,
-- private notes) into a calm per-profile row. NEVER includes passive
-- view/impression tracking — Sprint 6 invariant: no named viewer
-- surveillance in v1. Body returns a `private_note_preview` (first 120
-- chars) so the UI can render a one-line memory hint without loading
-- the full note in the desk list payload.
create or replace function public.get_relationship_desk_for_owner(
  p_limit integer default 50,
  p_offset integer default 0,
  p_status text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $a$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_status text := nullif(coalesce(p_status, ''), 'all');
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_result jsonb;
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;
  v_owner := v_uid;

  with raw_events as (
    select ar.requester_profile_id as related_profile_id,
           ar.created_at           as activity_at,
           'access_request'::text  as activity_type,
           coalesce(a.title, '*')  as subject_title,
           ar.status               as evt_status
    from public.access_requests ar
    left join public.artworks a
      on a.id = ar.subject_id and ar.subject_type = 'artwork'
    where ar.owner_profile_id = v_owner

    union all

    select pi.inquirer_id          as related_profile_id,
           pi.created_at           as activity_at,
           'inquiry'::text         as activity_type,
           coalesce(a.title, '*')  as subject_title,
           pi.inquiry_status       as evt_status
    from public.price_inquiries pi
    join public.artworks a on a.id = pi.artwork_id
    where a.artist_id = v_owner

    union all

    select ag.grantee_profile_id   as related_profile_id,
           ag.created_at           as activity_at,
           'grant'::text           as activity_type,
           coalesce(a.title, s.title, '*') as subject_title,
           'active'::text          as evt_status
    from public.access_grants ag
    left join public.artworks a
      on a.id = ag.subject_id and ag.subject_type = 'artwork'
    left join public.shortlists s
      on s.id = ag.subject_id and ag.subject_type = 'room'
    where ag.owner_profile_id = v_owner

    union all

    -- Followers of the owner (incoming follow edges).
    select f.follower_id           as related_profile_id,
           f.created_at            as activity_at,
           'follow'::text          as activity_type,
           null::text              as subject_title,
           f.status                as evt_status
    from public.follows f
    where f.following_id = v_owner
      and f.status = 'accepted'

    union all

    -- Notes the owner has written (so adding a note also surfaces the
    -- person on the desk even if they have no other recent signal).
    select rpn.target_profile_id   as related_profile_id,
           rpn.updated_at          as activity_at,
           'note'::text            as activity_type,
           null::text              as subject_title,
           'active'::text          as evt_status
    from public.relationship_private_notes rpn
    where rpn.owner_profile_id = v_owner
  ),
  events as (
    select * from raw_events where related_profile_id is not null
  ),
  filtered as (
    select * from events
    where v_status is null or activity_type = v_status
  ),
  latest as (
    select related_profile_id,
           max(activity_at) as last_activity_at
    from filtered
    group by related_profile_id
  ),
  latest_meta as (
    -- Pick a single representative event per profile (newest).
    -- distinct on lets us keep the row's activity_type and subject.
    select distinct on (e.related_profile_id)
      e.related_profile_id,
      e.activity_at,
      e.activity_type,
      e.subject_title
    from filtered e
    join latest l
      on l.related_profile_id = e.related_profile_id
     and l.last_activity_at = e.activity_at
    order by e.related_profile_id, e.activity_at desc, e.activity_type
  ),
  counts as (
    select related_profile_id,
      count(*) filter (where activity_type = 'access_request' and evt_status = 'pending') as pending_access_request_count,
      count(*) filter (where activity_type = 'inquiry' and evt_status <> 'closed')         as open_inquiry_count,
      count(*) filter (where activity_type = 'grant')                                       as active_grant_count
    from events
    group by related_profile_id
  ),
  page as (
    select lm.related_profile_id,
           lm.activity_at,
           lm.activity_type,
           lm.subject_title
    from latest_meta lm
    order by lm.activity_at desc
    limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'profile_id', p.id,
      'display_name', p.display_name,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'role_label', p.main_role,
      'relationship_status', case
        when exists (
          select 1 from public.follows f1
          where f1.follower_id = v_owner and f1.following_id = p.id and f1.status = 'accepted')
         and exists (
          select 1 from public.follows f2
          where f2.follower_id = p.id and f2.following_id = v_owner and f2.status = 'accepted')
          then 'mutual'
        when exists (
          select 1 from public.follows f2
          where f2.follower_id = p.id and f2.following_id = v_owner and f2.status = 'accepted')
          then 'follower'
        when exists (
          select 1 from public.follows f1
          where f1.follower_id = v_owner and f1.following_id = p.id and f1.status = 'accepted')
          then 'following'
        when exists (
          select 1 from public.access_grants g
          where g.owner_profile_id = v_owner and g.grantee_profile_id = p.id
            and (g.expires_at is null or g.expires_at > now()))
          then 'approved'
        else 'none'
      end,
      'last_activity_at', pg.activity_at,
      'last_activity_type', pg.activity_type,
      'last_subject_title', pg.subject_title,
      'pending_access_request_count', coalesce(c.pending_access_request_count, 0),
      'open_inquiry_count',          coalesce(c.open_inquiry_count, 0),
      'active_grant_count',          coalesce(c.active_grant_count, 0),
      'private_note_preview', (
        select left(rpn.note, 120)
        from public.relationship_private_notes rpn
        where rpn.owner_profile_id = v_owner
          and rpn.target_profile_id = p.id
        limit 1
      )
    )
    order by pg.activity_at desc
  ), '[]'::jsonb)
  into v_result
  from page pg
  join public.profiles p on p.id = pg.related_profile_id
  left join counts c on c.related_profile_id = pg.related_profile_id;

  return coalesce(v_result, '[]'::jsonb);
end;
$a$;

grant execute on function public.get_relationship_desk_for_owner(integer, integer, text) to authenticated;

-- == SECTION 6 == get_relationship_card_for_owner (RPC)

-- Detail surface for a single related profile. Owner-only by design;
-- target user must NEVER receive this payload. Returns a calm bundle
-- of: profile basics, relationship status, recent access requests
-- (capped), active access grants (capped), recent inquiries (capped),
-- shared rooms summary, and the private note body.
create or replace function public.get_relationship_card_for_owner(
  p_target_profile_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $a$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_target uuid := p_target_profile_id;
  v_profile jsonb;
  v_relationship_status text;
  v_requests jsonb;
  v_grants jsonb;
  v_inquiries jsonb;
  v_rooms jsonb;
  v_note jsonb;
begin
  if v_uid is null then
    return null;
  end if;
  v_owner := v_uid;
  if v_target is null or v_target = v_owner then
    return null;
  end if;

  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'bio', p.bio,
    'main_role', p.main_role,
    'roles', p.roles
  ) into v_profile
  from public.profiles p
  where p.id = v_target;

  if v_profile is null then
    return null;
  end if;

  v_relationship_status := case
    when exists (
      select 1 from public.follows f1
      where f1.follower_id = v_owner and f1.following_id = v_target and f1.status = 'accepted')
     and exists (
      select 1 from public.follows f2
      where f2.follower_id = v_target and f2.following_id = v_owner and f2.status = 'accepted')
      then 'mutual'
    when exists (
      select 1 from public.follows f2
      where f2.follower_id = v_target and f2.following_id = v_owner and f2.status = 'accepted')
      then 'follower'
    when exists (
      select 1 from public.follows f1
      where f1.follower_id = v_owner and f1.following_id = v_target and f1.status = 'accepted')
      then 'following'
    when exists (
      select 1 from public.access_grants g
      where g.owner_profile_id = v_owner and g.grantee_profile_id = v_target
        and (g.expires_at is null or g.expires_at > now()))
      then 'approved'
    else 'none'
  end;

  v_requests := (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', ar.id,
        'subject_type', ar.subject_type,
        'subject_id', ar.subject_id,
        'field_key', ar.field_key,
        'request_type', ar.request_type,
        'status', ar.status,
        'created_at', ar.created_at,
        'updated_at', ar.updated_at,
        'subject_title', a.title
      ) order by ar.created_at desc
    ), '[]'::jsonb)
    from (
      select * from public.access_requests
      where owner_profile_id = v_owner
        and requester_profile_id = v_target
      order by created_at desc
      limit 20
    ) ar
    left join public.artworks a
      on a.id = ar.subject_id and ar.subject_type = 'artwork'
  );

  v_grants := (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', ag.id,
        'subject_type', ag.subject_type,
        'subject_id', ag.subject_id,
        'field_key', ag.field_key,
        'grant_type', ag.grant_type,
        'expires_at', ag.expires_at,
        'created_at', ag.created_at,
        'subject_title', coalesce(a.title, s.title)
      ) order by ag.created_at desc
    ), '[]'::jsonb)
    from (
      select * from public.access_grants
      where owner_profile_id = v_owner
        and grantee_profile_id = v_target
      order by created_at desc
      limit 20
    ) ag
    left join public.artworks a
      on a.id = ag.subject_id and ag.subject_type = 'artwork'
    left join public.shortlists s
      on s.id = ag.subject_id and ag.subject_type = 'room'
  );

  v_inquiries := (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', pi.id,
        'artwork_id', pi.artwork_id,
        'inquiry_status', pi.inquiry_status,
        'created_at', pi.created_at,
        'last_message_at', pi.last_message_at,
        'subject_title', a.title
      ) order by coalesce(pi.last_message_at, pi.created_at) desc
    ), '[]'::jsonb)
    from public.price_inquiries pi
    join public.artworks a
      on a.id = pi.artwork_id and a.artist_id = v_owner
    where pi.inquirer_id = v_target
    limit 20
  );

  -- Rooms: shortlists owned by v_owner where the target has either an
  -- approved access grant OR has actually viewed via a recorded
  -- shortlist_views row. Best effort — both signals are owner-only.
  v_rooms := (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'room_id', s.id,
        'title', s.title,
        'has_active_grant', exists (
          select 1 from public.access_grants ag
          where ag.owner_profile_id = v_owner
            and ag.grantee_profile_id = v_target
            and ag.subject_type = 'room'
            and ag.subject_id = s.id
            and (ag.expires_at is null or ag.expires_at > now())
        ),
        'last_viewed_at', (
          select max(sv.created_at)
          from public.shortlist_views sv
          where sv.shortlist_id = s.id
            and sv.viewer_id = v_target
        )
      ) order by s.updated_at desc
    ), '[]'::jsonb)
    from public.shortlists s
    where s.owner_id = v_owner
      and (
        exists (
          select 1 from public.access_grants ag
          where ag.owner_profile_id = v_owner
            and ag.grantee_profile_id = v_target
            and ag.subject_type = 'room'
            and ag.subject_id = s.id
        )
        or exists (
          select 1 from public.shortlist_views sv
          where sv.shortlist_id = s.id and sv.viewer_id = v_target
        )
      )
    limit 20
  );

  v_note := (
    select jsonb_build_object(
      'id', rpn.id,
      'note', rpn.note,
      'updated_at', rpn.updated_at
    )
    from public.relationship_private_notes rpn
    where rpn.owner_profile_id = v_owner
      and rpn.target_profile_id = v_target
    limit 1
  );

  return jsonb_build_object(
    'profile', v_profile,
    'relationship_status', v_relationship_status,
    'requests', v_requests,
    'grants', v_grants,
    'inquiries', v_inquiries,
    'rooms', v_rooms,
    'private_note', v_note
  );
end;
$a$;

grant execute on function public.get_relationship_card_for_owner(uuid) to authenticated;

-- == SECTION 7 == resolve_access_request_v2 (additive grant lifecycle)

-- Phase E — additive RPC. Owner approval can now narrow the resulting
-- access_grant: a different subject_type/id (e.g. approve for a single
-- artwork even if the request was profile-wide), a different field_key
-- (approve for `price` only), and/or an `expires_at`. Decline behavior
-- is unchanged. The legacy `resolve_access_request(uuid, text)` keeps
-- working byte-for-byte; new owner-side surfaces opt in by calling
-- this signature.
create or replace function public.resolve_access_request_v2(
  p_request_id         uuid,
  p_action             text,
  p_grant_subject_type text default null,
  p_grant_subject_id   uuid default null,
  p_grant_field_key    text default null,
  p_expires_at         timestamptz default null
) returns public.access_requests
language plpgsql
security definer
set search_path = public
as $a$
declare
  v_uid uuid := auth.uid();
  v_req public.access_requests;
  v_new_status text;
  v_subject_type text;
  v_subject_id uuid;
  v_field_key text;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if p_action is null or p_action not in ('approve', 'decline') then
    raise exception 'invalid action: %', p_action;
  end if;

  select * into v_req from public.access_requests where id = p_request_id;
  if v_req.id is null then
    raise exception 'access request not found';
  end if;

  if v_uid <> v_req.owner_profile_id
     and not public.is_active_account_delegate_writer(v_req.owner_profile_id) then
    raise exception 'not authorized to resolve this access request';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'access request is not pending (status=%)', v_req.status;
  end if;

  v_subject_type := coalesce(p_grant_subject_type, v_req.subject_type);
  v_subject_id   := coalesce(p_grant_subject_id,   v_req.subject_id);
  v_field_key    := coalesce(p_grant_field_key,    v_req.field_key);

  if p_action = 'approve'
     and v_subject_id is not null
     and not public.visibility_subject_belongs_to_owner(
       v_req.owner_profile_id, v_subject_type, v_subject_id
     ) then
    raise exception 'subject does not belong to owner';
  end if;

  v_new_status := case p_action when 'approve' then 'approved' else 'declined' end;

  update public.access_requests
     set status = v_new_status,
         resolved_by = v_uid,
         resolved_at = now(),
         updated_at = now()
   where id = p_request_id
   returning * into v_req;

  if p_action = 'approve' then
    if v_subject_id is null then
      insert into public.access_grants (
        owner_profile_id, grantee_profile_id, subject_type, subject_id,
        field_key, grant_type, source_request_id, expires_at, created_by
      ) values (
        v_req.owner_profile_id, v_req.requester_profile_id, v_subject_type, null,
        v_field_key, 'request_approved', v_req.id, p_expires_at, v_uid
      )
      on conflict (owner_profile_id, grantee_profile_id, subject_type, field_key)
        where subject_id is null
      do update set expires_at = excluded.expires_at;
    else
      insert into public.access_grants (
        owner_profile_id, grantee_profile_id, subject_type, subject_id,
        field_key, grant_type, source_request_id, expires_at, created_by
      ) values (
        v_req.owner_profile_id, v_req.requester_profile_id, v_subject_type, v_subject_id,
        v_field_key, 'request_approved', v_req.id, p_expires_at, v_uid
      )
      on conflict (owner_profile_id, grantee_profile_id, subject_type, subject_id, field_key)
        where subject_id is not null
      do update set expires_at = excluded.expires_at;
    end if;
  end if;

  return v_req;
end;
$a$;

grant execute on function public.resolve_access_request_v2(uuid, text, text, uuid, text, timestamptz) to authenticated;
