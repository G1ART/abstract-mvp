-- Phase 1 — 외부(초대 전) 작가 정규화 "완결편" + 프로비넌스 정합성 하드닝.
--
-- 배경: 20260630 1차 dedupe 는 정규화된 display_name(전역) 기준으로 병합하되,
-- 같은 이름에 서로 다른 이메일이 2개 이상인 그룹은 동명이인/복수계정 가능성
-- 때문에 통째로 건너뛰었다. 그 결과 "같은 이메일" 중복(같은 사람이 이름 표기만
-- 다른 채로 여러 행)이 남았다. 이 파일은 그 잔여를 이메일 기준으로 마저
-- 합치고(DB 가드까지), 업로드/편집 경로의 중복 생성을 영구 차단한다.
--
-- 사용자 승인 규칙(보수적):
--   * 같은 (초대자, 이메일) → 같은 사람 → 병합.
--   * 서로 다른 이메일(aniimal2 vs aniimal2js 등) → 복수계정 가능 → 병합 금지.
--   * 이메일 없는 행끼리 같은 (초대자, 이름) → 식별 단서가 없어 동일 취급 → 병합.
--     (이메일 있는 행으로는 흡수하지 않음 — 모호하면 건드리지 않는다.)
--   * 이미 온보딩된(claimed_profile_id not null) 행은 미변경.
--
-- 적용: PL/pgSQL 본문이 여러 개이므로 Supabase SQL Editor 에서는 SECTION 단위
-- highlight → Run. (apply_migration MCP 는 전체를 한 단위로 보냄.)

begin;

-- == SECTION 1 == 2차 병합 (같은 이메일 → 병합, 이메일 없는 동일명 → 병합)
do $a$
declare
  g record;
  v_canonical uuid;
begin
  -- (1) 같은 (invited_by, lower(email)) — 이름 표기 변형까지 한 사람으로 통합
  for g in
    select invited_by, lower(trim(invite_email)) as email_key
      from public.external_artists
     where claimed_profile_id is null
       and nullif(trim(invite_email), '') is not null
     group by invited_by, lower(trim(invite_email))
    having count(*) > 1
  loop
    select ea.id into v_canonical
      from public.external_artists ea
     where ea.claimed_profile_id is null
       and ea.invited_by = g.invited_by
       and lower(trim(ea.invite_email)) = g.email_key
     order by (select count(*) from public.claims c where c.external_artist_id = ea.id) desc,
              ea.created_at asc, ea.id asc
     limit 1;

    update public.external_artists c
       set website   = coalesce(nullif(trim(c.website), ''), src.website),
           instagram = coalesce(nullif(trim(c.instagram), ''), src.instagram)
      from (
        select max(nullif(trim(website), '')) as website,
               max(nullif(trim(instagram), '')) as instagram
          from public.external_artists
         where claimed_profile_id is null
           and invited_by = g.invited_by
           and lower(trim(invite_email)) = g.email_key
      ) src
     where c.id = v_canonical;

    update public.claims
       set external_artist_id = v_canonical
     where external_artist_id in (
       select id from public.external_artists
        where claimed_profile_id is null
          and invited_by = g.invited_by
          and lower(trim(invite_email)) = g.email_key
          and id <> v_canonical
     );

    delete from public.external_artists
     where claimed_profile_id is null
       and invited_by = g.invited_by
       and lower(trim(invite_email)) = g.email_key
       and id <> v_canonical;
  end loop;

  -- (2) 이메일 없는 행끼리 같은 (invited_by, lower(display_name)) → 병합
  --     (이메일 있는 형제 행으로는 흡수하지 않음)
  for g in
    select invited_by, lower(trim(display_name)) as name_key
      from public.external_artists
     where claimed_profile_id is null
       and nullif(trim(invite_email), '') is null
       and coalesce(trim(display_name), '') <> ''
     group by invited_by, lower(trim(display_name))
    having count(*) > 1
  loop
    select ea.id into v_canonical
      from public.external_artists ea
     where ea.claimed_profile_id is null
       and ea.invited_by = g.invited_by
       and nullif(trim(ea.invite_email), '') is null
       and lower(trim(ea.display_name)) = g.name_key
     order by (select count(*) from public.claims c where c.external_artist_id = ea.id) desc,
              ea.created_at asc, ea.id asc
     limit 1;

    update public.claims
       set external_artist_id = v_canonical
     where external_artist_id in (
       select id from public.external_artists
        where claimed_profile_id is null
          and invited_by = g.invited_by
          and nullif(trim(invite_email), '') is null
          and lower(trim(display_name)) = g.name_key
          and id <> v_canonical
     );

    delete from public.external_artists
     where claimed_profile_id is null
       and invited_by = g.invited_by
       and nullif(trim(invite_email), '') is null
       and lower(trim(display_name)) = g.name_key
       and id <> v_canonical;
  end loop;
end;
$a$;

-- == SECTION 2 == 중복 재발 차단용 부분 유니크 인덱스
-- claimed 된 행은 (predicate false) 제외 → 온보딩 전환과 충돌하지 않는다.
create unique index if not exists uq_external_artists_inviter_email
  on public.external_artists (invited_by, lower(trim(invite_email)))
  where nullif(trim(invite_email), '') is not null and claimed_profile_id is null;

create unique index if not exists uq_external_artists_inviter_name_noemail
  on public.external_artists (invited_by, lower(trim(display_name)))
  where nullif(trim(invite_email), '') is null and claimed_profile_id is null;

-- == SECTION 3 == get_or_create_external_artist — dedupe 진입점(편집 화면 등)
-- 같은 초대자에 대해 (이메일|이름) 으로 기존 행 재사용. 유니크 인덱스와
-- 함께 race-safe (동시 업로드 시 unique_violation 을 잡아 재조회).
create or replace function public.get_or_create_external_artist(
  p_display_name text,
  p_invite_email text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $b$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'auth.uid() is null';
  end if;
  if p_display_name is null or length(trim(p_display_name)) < 2 then
    raise exception 'display_name must be at least 2 characters';
  end if;
  v_email := nullif(trim(p_invite_email), '');

  if v_email is not null then
    select id into v_id from public.external_artists
     where invited_by = v_uid and claimed_profile_id is null
       and lower(trim(invite_email)) = lower(v_email)
     order by created_at asc limit 1;
  else
    select id into v_id from public.external_artists
     where invited_by = v_uid and claimed_profile_id is null
       and lower(trim(display_name)) = lower(trim(p_display_name))
       and nullif(trim(invite_email), '') is null
     order by created_at asc limit 1;
  end if;
  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.external_artists (display_name, invite_email, invited_by, status)
    values (trim(p_display_name), v_email, v_uid, 'invited')
    returning id into v_id;
  exception when unique_violation then
    if v_email is not null then
      select id into v_id from public.external_artists
       where invited_by = v_uid and claimed_profile_id is null
         and lower(trim(invite_email)) = lower(v_email)
       order by created_at asc limit 1;
    else
      select id into v_id from public.external_artists
       where invited_by = v_uid and claimed_profile_id is null
         and lower(trim(display_name)) = lower(trim(p_display_name))
         and nullif(trim(invite_email), '') is null
       order by created_at asc limit 1;
    end if;
  end;

  return v_id;
end;
$b$;

grant execute on function public.get_or_create_external_artist(text, text) to authenticated;

-- == SECTION 4 == create_external_artist_and_claim — get_or_create 재사용 + race-safe
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
as $e$
declare
  v_uid        uuid := auth.uid();
  v_subject    uuid;
  v_ext_id     uuid;
  v_email      text;
  v_ext_row    jsonb;
  v_claim_row  jsonb;
begin
  if v_uid is null then
    raise exception 'auth.uid() is null';
  end if;
  if p_display_name is null or length(trim(p_display_name)) < 2 then
    raise exception 'display_name must be at least 2 characters';
  end if;
  if (p_work_id is null and p_project_id is null)
     or (p_work_id is not null and p_project_id is not null) then
    raise exception 'exactly one of work_id, project_id required';
  end if;
  if p_visibility is null then
    p_visibility := 'public';
  end if;
  if p_period_status is not null
     and p_period_status not in ('past', 'current', 'future') then
    raise exception 'period_status must be past, current, or future';
  end if;

  v_subject := coalesce(p_subject_profile_id, v_uid);
  if v_subject <> v_uid then
    if not public.is_active_writer_for(v_subject) then
      raise exception 'forbidden: caller is not an active account delegate writer for subject_profile_id';
    end if;
  end if;

  v_email := nullif(trim(p_invite_email), '');

  -- 기존 행 재사용(dedupe). get_or_create 가 race 까지 처리.
  v_ext_id := public.get_or_create_external_artist(p_display_name, v_email);

  -- 비어 있는 메타데이터 보충(덮어쓰지 않음).
  update public.external_artists
     set website      = coalesce(nullif(trim(website), ''), nullif(trim(p_website), '')),
         instagram    = coalesce(nullif(trim(instagram), ''), nullif(trim(p_instagram), '')),
         invite_email = coalesce(nullif(trim(invite_email), ''), v_email)
   where id = v_ext_id;

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
$e$;

grant execute on function public.create_external_artist_and_claim(text, text, uuid, uuid, text, text, text, text, text, uuid)
  to authenticated;

commit;
