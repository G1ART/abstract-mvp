-- 인기 탭 정렬용: artworks.likes_count 디노말 + 트리거 유지
alter table public.artworks add column if not exists likes_count integer not null default 0;

-- 기존 데이터 백필
update public.artworks a
set likes_count = coalesce(
  (select count(*)::int from public.artwork_likes al where al.artwork_id = a.id),
  0
);

-- artwork_likes 변경 시 해당 작품의 likes_count 갱신
create or replace function public.sync_artwork_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artwork_id uuid;
begin
  if tg_op = 'DELETE' then
    v_artwork_id := old.artwork_id;
  else
    v_artwork_id := new.artwork_id;
  end if;
  update public.artworks
  set likes_count = (select count(*)::int from public.artwork_likes where artwork_id = v_artwork_id)
  where id = v_artwork_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_artwork_likes_count on public.artwork_likes;
create trigger trg_sync_artwork_likes_count
  after insert or delete on public.artwork_likes
  for each row execute function public.sync_artwork_likes_count();

-- 인기 정렬 쿼리용 복합 인덱스 (선택)
create index if not exists idx_artworks_public_likes_created_id
  on public.artworks(visibility, likes_count desc nulls last, created_at desc, id desc)
  where visibility = 'public';
