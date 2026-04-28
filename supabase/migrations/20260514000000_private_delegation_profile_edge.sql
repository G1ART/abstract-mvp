-- Private Account v2 — PR-C · 위임 edge 가시성 정합화
--
-- Symptom (QA beta report 2026-04-28):
--   • #6 비공계 계정에게 위임을 받으면 [내 스튜디오] 가 빈 페이지처럼 뜸
--   • #8 비공계 계정에게 위임을 받아 업로드한 작품의 작가 이름이 피드에서
--        '알 수 없는 사용자' 로 노출
--   • #9 비공계 계정 본인이 직접 업로드한 작품도 일부 surface 에서
--        '알 수 없는 사용자' 로 노출
--
-- Root cause:
--   PR1 (`20260511000000_private_account_searchable_and_follow_requests.sql`)
--   가 비공계 profile 의 SELECT 를 follower edge 가 있는 viewer 에게만 허용
--   하도록 좁혔고, hotfix (`20260513000000_private_account_signup_hotfix.sql`)
--   가 그 정책을 SECURITY DEFINER helper `viewer_shares_follow_edge_with`
--   기반으로 단일화함. 그러나 helper 가 `public.follows` edge 만 검사하므로,
--   *위임 edge* (account-scope delegation 의 delegator <-> delegate) 는
--   profile metadata 가시성에서 누락. 그 결과:
--     • delegate 가 acting-as 로 작업할 때 delegator 의 username/display_name
--       을 못 읽어 헤더/카드가 unknown placeholder 로 fallback.
--     • 이 unknown profile 이 자식 컴포넌트(피드 카드, 내 스튜디오 hero,
--       검색 결과 등)에 그대로 propagate.
--
-- Fix:
--   1) 새 helper `viewer_shares_delegation_edge_with(p_other)` 도입.
--      account-scope, status='active' 의 delegations 테이블을 양방향으로
--      검사 (`(delegator=p_other AND delegate=me) OR (delegate=p_other AND
--      delegator=me)`). SECURITY DEFINER STABLE 로 RLS 재진입 회피
--      (signup-time trigger 와의 호환은 hotfix 와 동일 원리).
--
--   2) `profiles_select_follow_edge` 정책을 `profiles_select_visibility_edge`
--      로 재선언. USING 은 두 helper 의 OR 결합:
--          viewer_shares_follow_edge_with(profiles.id)
--          OR viewer_shares_delegation_edge_with(profiles.id)
--      → follow edge 가 있는 viewer + 위임 edge 가 있는 viewer 모두 메타
--      카드 컬럼을 SELECT 가능. 일반 viewer (둘 다 없음) 는 여전히 차단.
--
-- Scope 한정:
--   • account-scope 만 cover. project-scope 는 단일 프로젝트 페이지에서만
--     surface 되므로 profile metadata 전반 노출은 과도함 → 제외.
--   • 본 변경은 기존 follower-edge 동작에는 무영향 (OR 한 항 추가).
--   • 콘텐츠 (artworks/projects) RLS 는 이미 `*_select_account_delegate`
--     정책 (p0_delegations_account_scope_rls.sql) 으로 위임자 cover —
--     별도 변경 없음.
--
-- 회귀 안전성:
--   • 정책이 SELECT 만 OR 확장 (`true` 반환 cap 추가). UPDATE/INSERT/DELETE
--     unchanged. 따라서 새로 *덜* 보이게 되는 케이스는 없음 (= 후퇴 없음).
--   • Helper 는 SECURITY DEFINER STABLE — RLS 재진입 없음.
--   • 일반 viewer (follow/위임 모두 없음) 는 비공계 profile 여전히 차단.
--
-- Safe to re-run: `create or replace` + `drop policy if exists` + `create policy`.
--
-- Pre-requisite handling:
--   This migration depends on `viewer_shares_follow_edge_with(uuid)` which
--   was originally introduced by the signup hotfix
--   (`20260513000000_private_account_signup_hotfix.sql`). To make THIS
--   migration self-contained — so QA / staging / prod environments that
--   may have skipped the hotfix can still apply it — we redefine that
--   helper here as well via `create or replace`. If the hotfix has
--   already run, the redefinition is a no-op (identical body).

begin;

---------------------------------------------------------------------------
-- 0. (defensive) ensure follow-edge helper exists. Identical body to the
--    one in 20260513000000_private_account_signup_hotfix.sql, so this is
--    a no-op when the hotfix has already been applied.
---------------------------------------------------------------------------

create or replace function public.viewer_shares_follow_edge_with(p_other uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when auth.uid() is null or p_other is null or auth.uid() = p_other
      then false
    else exists (
      select 1 from public.follows f
      where (f.follower_id = auth.uid() and f.following_id = p_other)
         or (f.following_id = auth.uid() and f.follower_id = p_other)
    )
  end;
$$;

revoke all on function public.viewer_shares_follow_edge_with(uuid) from public;
grant execute on function public.viewer_shares_follow_edge_with(uuid)
  to authenticated;

---------------------------------------------------------------------------
-- 1. 새 helper — viewer_shares_delegation_edge_with(uuid)
---------------------------------------------------------------------------

-- Returns TRUE when the calling user shares an *active account-scope*
-- delegation with the target profile, in either direction:
--   • caller is the delegate of `p_other`'s account-scope delegation, OR
--   • caller is the delegator and `p_other` is the active delegate.
-- Returns FALSE for unauth, NULL target, self-reference, project-scope
-- delegations, and pending/declined/revoked rows.
create or replace function public.viewer_shares_delegation_edge_with(p_other uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when auth.uid() is null or p_other is null or auth.uid() = p_other
      then false
    else exists (
      select 1 from public.delegations d
       where d.scope_type = 'account'::public.delegation_scope_type
         and d.status     = 'active'::public.delegation_status_type
         and (
              (d.delegator_profile_id = p_other and d.delegate_profile_id = auth.uid())
           or (d.delegate_profile_id  = p_other and d.delegator_profile_id = auth.uid())
         )
    )
  end;
$$;

revoke all on function public.viewer_shares_delegation_edge_with(uuid) from public;
grant execute on function public.viewer_shares_delegation_edge_with(uuid)
  to authenticated;

comment on function public.viewer_shares_delegation_edge_with(uuid) is
  'TRUE iff caller and target share an active account-scope delegation '
  '(either direction). Used by profiles_select_visibility_edge to expose '
  'meta-card columns to delegated counterparties of private accounts.';

---------------------------------------------------------------------------
-- 2. profiles SELECT — fold delegation edge into the existing follow-edge
--    policy. We rename to `profiles_select_visibility_edge` so the
--    semantics ("profile is visible across any privileged edge") are
--    self-documenting; the old name is dropped.
---------------------------------------------------------------------------

drop policy if exists profiles_select_follow_edge          on public.profiles;
drop policy if exists profiles_select_follow_request_actor on public.profiles;
drop policy if exists profiles_select_follow_request_target on public.profiles;
drop policy if exists profiles_select_visibility_edge      on public.profiles;

create policy profiles_select_visibility_edge on public.profiles
  for select to authenticated
  using (
    public.viewer_shares_follow_edge_with(profiles.id)
    or public.viewer_shares_delegation_edge_with(profiles.id)
  );

commit;
