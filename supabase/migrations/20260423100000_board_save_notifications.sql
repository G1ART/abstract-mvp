-- Board save notifications + public-transition notifications + artist-side signal RPC.
--
-- Rationale (2026-04-23):
--   Artists — especially emerging — want to know when a collector/curator
--   saves their work to a board, even privately. That is a meaningful
--   interest signal that the product should not swallow. We emit:
--     1) `board_save`     when a work is added to ANY board (public or private).
--                         Privacy-safe payload: actor + artwork only. No board title.
--     2) `board_public`   when a board transitions private -> public. Board
--                         is now shareable so we expose the board title + token.
--   And an RPC:
--     `get_board_save_signals()` returning aggregate counts only (boards,
--     savers). No per-board details, preserving curator scouting privacy.
--
--   Security: dedup 7 days per (artist, actor, artwork) to avoid spam when
--   the same curator moves a work between boards. Self-saves never notify.

begin;

-- 1. Expand notification type enum via CHECK constraint

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
    'like','follow','claim_request','claim_confirmed','claim_rejected',
    'price_inquiry','price_inquiry_reply','new_work','connection_message',
    'board_save','board_public'
  ]));

-- 2. Trigger: shortlist_items INSERT -> notify artist (dedup 7d, skip self)

create or replace function public.notify_on_board_save()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist_id  uuid;
  v_owner_id   uuid;
  v_is_private boolean;
  v_dupe       uuid;
begin
  if new.artwork_id is null then
    return new;
  end if;

  select artist_id into v_artist_id
    from public.artworks
   where id = new.artwork_id;

  select owner_id, is_private into v_owner_id, v_is_private
    from public.shortlists
   where id = new.shortlist_id;

  -- skip: artwork with no artist, or self-save (board owner == artist)
  if v_artist_id is null or v_owner_id is null or v_artist_id = v_owner_id then
    return new;
  end if;

  -- dedup: suppress a duplicate board_save from the same actor for the
  -- same artwork within 7 days (prevents toast spam when a curator moves
  -- works between boards)
  select id into v_dupe
    from public.notifications
   where user_id = v_artist_id
     and type    = 'board_save'
     and actor_id = v_owner_id
     and artwork_id = new.artwork_id
     and created_at > now() - interval '7 days'
   limit 1;
  if v_dupe is not null then
    return new;
  end if;

  insert into public.notifications (user_id, type, actor_id, artwork_id, payload)
  values (
    v_artist_id,
    'board_save',
    v_owner_id,
    new.artwork_id,
    jsonb_build_object(
      'shortlist_id', new.shortlist_id,
      'is_private',   coalesce(v_is_private, true)
    )
  );
  return new;
end;
$$;

drop trigger if exists on_board_save_notify on public.shortlist_items;
create trigger on_board_save_notify
  after insert on public.shortlist_items
  for each row execute function public.notify_on_board_save();

-- 3. Trigger: shortlists.is_private true -> false transition
--    Emits board_public to each distinct non-owner artist whose work is in the board.

create or replace function public.notify_on_board_public_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_aw  uuid;
begin
  for v_rec in
    select distinct a.artist_id
      from public.shortlist_items si
      join public.artworks a on a.id = si.artwork_id
     where si.shortlist_id = new.id
       and si.artwork_id is not null
       and a.artist_id is not null
       and a.artist_id <> new.owner_id
  loop
    select si.artwork_id into v_aw
      from public.shortlist_items si
      join public.artworks a on a.id = si.artwork_id
     where si.shortlist_id = new.id
       and a.artist_id = v_rec.artist_id
     order by si.position nulls last, si.created_at
     limit 1;

    insert into public.notifications (user_id, type, actor_id, artwork_id, payload)
    values (
      v_rec.artist_id,
      'board_public',
      new.owner_id,
      v_aw,
      jsonb_build_object(
        'shortlist_id',    new.id,
        'shortlist_title', new.title,
        'share_token',     new.share_token
      )
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists on_shortlist_public_transition on public.shortlists;
create trigger on_shortlist_public_transition
  after update of is_private on public.shortlists
  for each row
  when (old.is_private = true and new.is_private = false)
  execute function public.notify_on_board_public_transition();

-- 4. Aggregate signal for artists: how many boards contain their works
--    + how many distinct savers, returned as a single jsonb object.
--    SECURITY DEFINER because shortlist_items RLS only grants SELECT to the
--    board owner/collaborators; this aggregate does NOT leak any identities
--    or per-board details to the artist.

create or replace function public.get_board_save_signals()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select si.shortlist_id, s.owner_id
      from public.shortlist_items si
      join public.artworks    a on a.id = si.artwork_id
      join public.shortlists  s on s.id = si.shortlist_id
     where si.artwork_id is not null
       and a.artist_id = auth.uid()
       and s.owner_id <> auth.uid()  -- exclude self-curation from the signal
  )
  select jsonb_build_object(
    'boards_count', (select count(distinct shortlist_id) from mine),
    'savers_count', (select count(distinct owner_id)     from mine)
  );
$$;

revoke all on function public.get_board_save_signals() from public;
grant execute on function public.get_board_save_signals() to authenticated;

comment on function public.notify_on_board_save() is
  'Notify artwork artist when their work is saved to a shortlist/board. Skips self-save; dedups 7 days per (artist, actor, artwork).';
comment on function public.notify_on_board_public_transition() is
  'Notify artists whose works are in a shortlist when that shortlist transitions from private to public.';
comment on function public.get_board_save_signals() is
  'Artist-scoped aggregate: number of distinct boards that contain my works, and number of distinct savers. No per-board detail exposed.';

commit;
