-- Phase 1 — 프로비넌스 정합성 하드닝 (FK cascade + updated_at).
--
-- 1) claims.project_id FK 를 ON DELETE CASCADE 로.
--    현재는 NO ACTION 이라 전시(projects) 삭제 시 project_id 를 가진 claim
--    (CURATED/HOSTS_PROJECT/INCLUDES_WORK)이 삭제를 막는다. 앱은
--    deleteExhibitionKeepWorks 에서 claims 를 수동 선삭제로 우회 중인데,
--    다른 삭제 경로가 생기면 쉽게 깨지는 풋건이다. exhibition_works /
--    exhibition_media 가 이미 CASCADE 이므로 동작 일관성을 맞춘다.
--    (work_id 를 가진 claim 은 work FK CASCADE 로 별도 처리되어 영향 없음.)
--
-- 2) claims / external_artists / projects 에 updated_at + 갱신 트리거.
--    프로비넌스 편집/확정 흐름의 감사·디버깅을 위해. 모두 additive.

begin;

-- == SECTION 1 == claims.project_id FK → ON DELETE CASCADE
alter table public.claims drop constraint if exists claims_project_id_fkey;
alter table public.claims
  add constraint claims_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;

-- == SECTION 2 == updated_at 컬럼 (additive)
alter table public.claims           add column if not exists updated_at timestamptz not null default now();
alter table public.external_artists add column if not exists updated_at timestamptz not null default now();
alter table public.projects         add column if not exists updated_at timestamptz not null default now();

-- == SECTION 3 == 갱신 트리거 함수 + 트리거
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $a$
begin
  new.updated_at = now();
  return new;
end;
$a$;

drop trigger if exists trg_claims_updated_at on public.claims;
create trigger trg_claims_updated_at
  before update on public.claims
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_external_artists_updated_at on public.external_artists;
create trigger trg_external_artists_updated_at
  before update on public.external_artists
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.tg_set_updated_at();

commit;
