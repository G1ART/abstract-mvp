-- QA 2026-06-29 — 외부(초대 전, 미온보딩) 작가 작품의 "작가 이름"이 게시물
-- 단위(작품 상세, 전시, 룸/숏리스트)에서 업로드한 계정(갤러리)명으로
-- 표시되던 버그.
--
-- 원인: 룸/숏리스트 RPC 들이 작가명을 `profiles.display_name` (artworks.artist_id
--       = 업로더/갤러리) 에서만 가져왔다. 외부 작가의 실제 표기명은
--       claims -> external_artists.display_name 에 들어 있다.
--
-- 픽스: 작품의 표시용 작가명을 한 곳에서 해석하는 헬퍼를 만들고, 룸/숏리스트
--       RPC 두 곳이 이를 쓰도록 교체한다 (외부 작가명 우선, 없으면 업로더명).
--
-- ⚠️ 적용 시: 아래 SECTION 배너 단위로 highlight → Run (한꺼번에 paste 금지).

-- == SECTION 1 == 표시용 작가명 해석 헬퍼 ============================
-- 외부(초대) 작가의 공개/확정 claim 표기명을 우선 반환, 없으면 fallback
-- (업로더 profiles.display_name). CREATED claim 을 우선한다.
create or replace function public.artwork_display_artist_name(
  p_work_id uuid,
  p_fallback text
) returns text
language sql
stable
security definer
set search_path = public
as $a$
  select coalesce(
    (
      select ea.display_name
        from public.claims c
        join public.external_artists ea on ea.id = c.external_artist_id
       where c.work_id = p_work_id
         and ea.display_name is not null
         and btrim(ea.display_name) <> ''
         and (c.status is null or c.status = 'confirmed')
       order by (case when c.claim_type = 'CREATED' then 0 else 1 end), c.created_at
       limit 1
    ),
    p_fallback
  );
$a$;

revoke all on function public.artwork_display_artist_name(uuid, text) from public;
grant execute on function public.artwork_display_artist_name(uuid, text) to authenticated;
grant execute on function public.artwork_display_artist_name(uuid, text) to anon;

-- == SECTION 2 == get_room_for_viewer_by_token (외부 작가명 반영) =======
create or replace function public.get_room_for_viewer_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $b$
declare
  v_uid uuid := auth.uid();
  v_token uuid;
  v_room record;
  v_owner uuid;
  v_resolution jsonb;
  v_relationship jsonb;
  v_can boolean;
  v_meta jsonb;
  v_items jsonb;
begin
  if p_token is null or length(p_token) = 0 then
    return null;
  end if;

  begin
    v_token := p_token::uuid;
  exception when others then
    return null;
  end;

  select s.id, s.title, s.description, s.owner_id,
         p.username as owner_username,
         p.display_name as owner_display_name
  into v_room
  from public.shortlists s
  join public.profiles p on p.id = s.owner_id
  where s.share_token = v_token
    and s.room_active = true
    and (s.expires_at is null or s.expires_at > now());

  if v_room.id is null then
    return null;
  end if;

  v_owner := v_room.owner_id;
  v_resolution := public.resolve_visibility_for_viewer(v_owner, 'room', v_room.id, '*');
  v_relationship := public.get_viewer_relationship_context(v_owner);
  v_can := coalesce((v_resolution->>'can_view')::boolean, false);

  v_meta := jsonb_build_object(
    'id', v_room.id,
    'title', v_room.title,
    'description', v_room.description,
    'owner_id', v_room.owner_id,
    'owner_username', v_room.owner_username,
    'owner_display_name', v_room.owner_display_name
  );

  if v_can then
    begin
      insert into public.shortlist_views (shortlist_id, viewer_id, action)
      values (v_room.id, v_uid, 'viewed');
    exception when others then
      null;
    end;

    v_items := (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'item_id', si.id,
            'artwork_id', si.artwork_id,
            'exhibition_id', si.exhibition_id,
            'note', si.note,
            'position', si."position",
            'artwork_title', a.title,
            'artwork_image_path', (
              select ai.storage_path
              from public.artwork_images ai
              where ai.artwork_id = a.id
              order by ai."position" limit 1
            ),
            'artwork_artist_name', public.artwork_display_artist_name(a.id, prof.display_name),
            'exhibition_title', proj.title
          )
          order by si."position", si.created_at
        ),
        '[]'::jsonb
      )
      from public.shortlist_items si
      left join public.artworks a on a.id = si.artwork_id and a.visibility = 'public'
      left join public.profiles prof on prof.id = a.artist_id
      left join public.projects proj on proj.id = si.exhibition_id
      where si.shortlist_id = v_room.id
    );
  else
    v_items := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'room', v_meta,
    'items', v_items,
    'visibility', v_resolution,
    'relationship', v_relationship,
    'can_view', v_can
  );
end;
$b$;

grant execute on function public.get_room_for_viewer_by_token(text) to authenticated;
grant execute on function public.get_room_for_viewer_by_token(text) to anon;

-- == SECTION 3 == get_shortlist_items_by_token (외부 작가명 반영) =======
create or replace function public.get_shortlist_items_by_token(p_token uuid)
returns table(
  item_id uuid,
  artwork_id uuid,
  exhibition_id uuid,
  note text,
  "position" integer,
  artwork_title text,
  artwork_image_path text,
  artwork_artist_name text,
  exhibition_title text
)
language plpgsql
security definer
set search_path = public
as $c$
declare
  v_shortlist_id uuid;
begin
  select s.id into v_shortlist_id
    from public.shortlists s
   where s.share_token = p_token
     and s.room_active = true
     and (s.expires_at is null or s.expires_at > now());
  if v_shortlist_id is null then return; end if;

  insert into public.shortlist_views (shortlist_id, viewer_id, action)
    values (v_shortlist_id, auth.uid(), 'viewed');

  return query
    select si.id as item_id, si.artwork_id, si.exhibition_id, si.note, si."position",
           a.title as artwork_title,
           (select ai.storage_path from public.artwork_images ai where ai.artwork_id = a.id order by ai."position" limit 1) as artwork_image_path,
           public.artwork_display_artist_name(a.id, prof.display_name) as artwork_artist_name,
           proj.title as exhibition_title
      from public.shortlist_items si
      left join public.artworks a on a.id = si.artwork_id and a.visibility = 'public'
      left join public.profiles prof on prof.id = a.artist_id
      left join public.projects proj on proj.id = si.exhibition_id
     where si.shortlist_id = v_shortlist_id
     order by si."position", si.created_at;
end;
$c$;

grant execute on function public.get_shortlist_items_by_token(uuid) to authenticated;
grant execute on function public.get_shortlist_items_by_token(uuid) to anon;
