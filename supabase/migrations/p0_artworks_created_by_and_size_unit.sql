-- 1) artworks.created_by: 업로드 당사자(작품 레코드를 생성한 사람)가 클레임 없이도 삭제 가능하도록
alter table public.artworks add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- 2) artworks DELETE: artist 또는 claim 보유자 또는 created_by(업로더) 허용
drop policy if exists "Allow owner delete artwork" on public.artworks;
create policy "Allow owner delete artwork" on public.artworks
  for delete to authenticated
  using (
    artist_id = auth.uid()
    or created_by = auth.uid()
    or exists (
      select 1 from public.claims c
      where c.work_id = artworks.id and c.subject_profile_id = auth.uid()
    )
  );

-- 3) artwork_images DELETE: 작품의 artist 또는 created_by 또는 claim 보유자 허용 (기존 artist만 허용 정책 대체)
drop policy if exists "Allow owner delete artwork_images" on public.artwork_images;
create policy "Allow owner delete artwork_images" on public.artwork_images
  for delete to authenticated
  using (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id
        and (a.artist_id = auth.uid() or a.created_by = auth.uid())
    )
    or exists (
      select 1 from public.claims c
      where c.work_id = artwork_images.artwork_id and c.subject_profile_id = auth.uid()
    )
  );

-- 4) size_unit: 사용자 입력 단위 보존 (cm | in). null = 기존 데이터/호수 등
alter table public.artworks add column if not exists size_unit text check (size_unit is null or size_unit in ('cm', 'in'));
