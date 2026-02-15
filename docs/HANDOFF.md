# Abstract MVP — HANDOFF (Single Source of Truth)

Last updated: 2026-02-14 (America/Los_Angeles)

## 1) Project identity
- Product: **Abstract** (art platform MVP)
- Goal: 빠르게 작품을 올리고(아카이브), 사람을 발견하고(팔로우/디렉토리), 작품을 탐색(피드)하는 최소 기능을 **안정적으로** 제공

## 2) Repo / Branch / Local
- GitHub repo: `G1ART/abstract-mvp` (URL: TODO)
- Branch: TODO (예: main)
- Local folder: TODO (예: ~/Desktop/abstract-mvp)

## 3) Production / Deploy
- Vercel Production URL: https://abstract-mvp-5vik.vercel.app
- Vercel project name: TODO
- Root Directory (Vercel): TODO (보통 ".")

## 4) Tech stack
- Next.js (App Router)
- Supabase (Auth, Postgres, Storage, RLS, RPC)
- Vercel (deploy)
- Tailwind
- DnD: `@dnd-kit/core`, `@dnd-kit/sortable`
- i18n: cookie `ab_locale` + middleware + `useT()`

## 5) Key routes
- `/login` (magic link)
- `/onboarding` (username + roles + main_role)
- `/set-password` (OTP 후 패스워드 설정)
- `/feed` (All/Following, Latest/Popular, thread-style)
- `/artists` (directory + search + follow)
- `/u/[username]` (public profile + works, private handling)
- `/me` (KPIs + my works)
- `/settings` (edit profile → save 후 /u/<username> redirect)
- `/upload` (single upload)
- `/upload/bulk` (bulk upload drafts)

## 6) Current MVP capabilities (working)
### Auth / Onboarding
- Email magic link login
- Onboarding creates/updates profile:
  - `username` required (3–20, lowercase/num/_)
  - `main_role` (single) + `roles` (multi, min 1)
- Password setup:
  - `/set-password` uses `supabase.auth.updateUser({ password })`
  - localStorage flag `has_password`로 OTP 로그인 후 패스워드 설정 유도
  - Note: Supabase email rate limiting observed during password recovery tests

### Navigation
- Header “Abstract” logo → feed (logout/reset 아님)
- Logged-in nav: Feed / Artists / Me / Upload / Settings

### Feed (thread style)
- `/feed`:
  - artist-centric thread cards (avatar, display_name, @username, bio 2줄, Follow, thumbnails up to 6, profile link)
  - Tabs: All / Following
  - Sort: Latest / Popular (popular = likes_count client-side sort before grouping)
  - Refresh + window focus refetch

### Profiles
- `/u/[username]`:
  - avatar, display_name, @username, bio, roles, website/location
  - artist’s public artworks
  - FollowButton (viewer != self)
  - Private profile:
    - non-owner: “This profile is private.”
    - owner: self-view allowed

### Artists directory
- `/artists`: list + debounced search, follow/unfollow

### Artworks
- Upload:
  - storage bucket `artworks`에 이미지 업로드
  - artworks row + artwork_images row 생성
  - ownership_status visible
  - pricing_mode fixed/inquire, price visibility
  - USD baseline, KRW input → env rate로 USD 변환(MVP)
- Detail:
  - likes + view events (de-dup TTL)

### Likes
- `artwork_likes` table
- likes_count normalization in code to avoid postgrest shape issues
- Popular sorting based on likes_count

### Me dashboard
- `/me`: KPIs (artworks, followers, views) + my artworks list

### Settings UX
- `/settings` save → `/u/<username>`
- One-time banner “Profile updated” (sessionStorage flag)
- Username missing fallback “Saved.” (rare; ensure getMyProfile includes username)

## 7) Supabase DB / Storage / RLS / RPC (critical)
### Tables
- profiles
- follows
- artworks
- artwork_images
- artwork_views
- artwork_likes

### Storage
- bucket: `artworks` (public)

### RLS expectations
- profiles: public profiles or self SELECT; writes self-scoped
- follows/artworks/artwork_images/artwork_views/artwork_likes: auth.uid() scoped

### RPC (must exist)
- `public.lookup_profile_by_username(text) returns jsonb`
  - public profile: returns id, username, display_name, avatar_url, bio, location, website, main_role, roles, is_public=true
  - private profile: returns only `{ "is_public": false }`
  - not found: returns null
- Note: function dropped+recreated due to return type change limitation

## 8) v1.12 — Bulk Upload (Draft workflow) + Delete
### Bulk Upload
- Route: `/upload/bulk`
- Flow:
  1) Select files → Pending queue (pre-upload remove individual/all)
  2) Start Upload → draft 생성 + 이미지 업로드/첨부
  3) Draft table → Apply-to-all 메타 일괄 적용
  4) Publish panel → validatePublish 충족 시 publish
  5) Publish 후 public feed 노출, draft 목록에서 제거

### Data layer (src/lib/supabase/artworks.ts)
- `createDraftArtwork({ title })` → `visibility='draft'`
- `updateArtwork(id, partial)` (batch 수정)
- `listMyDraftArtworks({ limit })`
- `publishArtworks(ids)` → `public` 전환
- `validatePublish(artwork)` → title/ownership/pricing + image>=1

### DB
- `artwork_visibility` enum에 `draft` 포함(추가 완료 상태 전제)
- draft 단계 컬럼 nullable 권장, 발행 시 validate로 강제

### Delete (hard delete)
- SQL (Supabase SQL Editor에서 수동 실행)
  1) `supabase/migrations/artwork_delete_rls.sql`
     - artworks: owner-only DELETE
     - artwork_images: owner-only write; read owner or public artwork
  2) `supabase/migrations/artwork_delete_storage.sql`
     - storage.objects: bucket=artworks AND path starts with `auth.uid()` → DELETE allow
- Code
  - `deleteArtworkCascade(artworkId)`:
    storage → artwork_images rows → artworks row (storage 실패해도 DB 삭제 진행; warning)
  - `deleteDraftArtworks(ids)` concurrency 5
- UI
  - `/upload/bulk`: Delete selected/all drafts + pending removal
  - `/artwork/[id]`: owner only delete → `/me`
  - `/me`: delete action + refresh + toast

## 9) v1.13 — Portfolio Reorder
### DB migration (manual apply required)
- `supabase/migrations/artworks_artist_sort_order.sql`
  - `artist_sort_order bigint NULL`
  - `artist_sort_updated_at timestamptz DEFAULT now()`
  - index `(artist_id, artist_sort_order ASC NULLS LAST, created_at DESC)`
  - RLS: UPDATE owner-only (auth.uid() = artist_id)

### Data layer
- `ARTWORK_SELECT` includes `artist_sort_order`
- `listPublicArtworksByArtistId` order:
  - `artist_sort_order ASC NULLS LAST`, then `created_at DESC`
- `updateMyArtworkOrder(orderedIds)` concurrency 5

### UI
- `src/components/UserProfileContent.tsx`
  - owner만 Reorder 버튼
  - DnD grid with drag handle
  - Save/Cancel, save 후 `router.refresh()`
- i18n keys: `profile.reorder*`

## 10) i18n
- Cookie: `ab_locale`
- Middleware: country(KR)/accept-language 기반 초기 locale
- Header 토글: cookie 저장 + `router.refresh()`
- 적용 범위: nav, feed, profile, settings, upload, artists, me, login 등

## 11) Known issues / risks
- `has_password`가 localStorage 기반 (clear하면 /set-password 재유도) → 추후 DB flag 고려
- Popular sorting client-side → 데이터 커지면 server ranking 필요
- Bulk import (CSV/zip/AI extraction) 아직 제한적

## 12) Operational checklist
### Supabase (People + Entitlements + Profile v0)
- [ ] `supabase/migrations/profile_v0_fields.sql` — profiles v0 columns + indexes
- [ ] `supabase/migrations/people_rpc.sql` — get_recommended_people (reason_tags), search_people
- [ ] `supabase/migrations/entitlements_profile_views.sql` — entitlements, profile_views tables + RLS
- [ ] `supabase/migrations/profile_views_rpc.sql` — get_profile_views_count, get_profile_viewers

### Supabase (기존)
- [ ] `artwork_visibility` enum에 `draft` 포함 확인
- [ ] `artwork_delete_rls.sql` 실행
- [ ] `artwork_delete_storage.sql` 실행
- [ ] `artworks_artist_sort_order.sql` 실행 (reorder 기능 필수)
- [ ] draft 생성에 NOT NULL 제약이 방해되지 않는지 확인

### Vercel
- [ ] Env vars (Scopes: Production + Preview + ideally Development)
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://<project>.supabase.co` (공백/따옴표/줄바꿈 금지)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (줄바꿈 금지)
- [ ] `npm run build` 로컬 빌드 성공 확인

### QA (must-pass)
- [ ] Bulk pending remove (개별/전체)
- [ ] Bulk draft 생성 + Delete selected/all (DB + storage cleanup)
- [ ] Publish validate gating 동작
- [ ] Owner delete artwork works; 다른 유저는 불가
- [ ] Reorder 저장 후 새로고침에도 순서 유지 + visitor 동일
- [ ] i18n 토글 쿠키 유지

---

## 13) v1.13.1 — 운영 안정화 P0

### 변경 파일
- `src/lib/supabase/migrationGuard.ts` — Migration check (visibility draft, artist_sort_order, delete RLS)
- `src/components/MigrationGuard.tsx` — Layout 마운트, dev: toast, prod: console only
- `src/app/layout.tsx` — MigrationGuard 추가
- `src/components/UserProfileContent.tsx` — Reorder 실패 시 keep mode + error toast + Retry
- `src/lib/supabase/artworks.ts` — deleteArtworkCascade storage 실패 시 구조화 로그 (paths 포함)
- `src/lib/i18n/messages.ts` — profile.reorderSaveFailed, common.retry
- `docs/QA_SMOKE.md` — 스모크 테스트 체크리스트

### 검증 절차
1. Migration 미적용 상태에서 dev 실행 → 토스트 "Supabase migration not applied" 확인
2. Reorder Save 실패 시뮬레이션(네트워크 차단 등) → mode 유지, Retry 버튼 동작
3. Storage delete 실패 시 console 출력에 `storage_delete_failed` + paths JSON 확인
4. `docs/QA_SMOKE.md` 체크리스트대로 수동 스모크

---

## 14) v1.13.2 — Reorder 버튼 복구 (Owner 판별 + MigrationGuard 무해화)

### Root cause
- owner 판별이 `profile.id === session.user.id`에만 의존
- session 로딩 지연 시 isOwner가 false로 남거나, profile.id 누락/불일치 시 항상 false

### 수정 파일
- `src/components/UserProfileContent.tsx` — owner 판별 견고화: id match + username fallback, session null 시 400ms 재시도
- `src/components/MigrationGuard.tsx` — try/catch, .catch()로 UI 차단 방지

### 검증
1. 로그인 → /me → View profile → /u/\<myusername> → Reorder 버튼 노출 확인
2. 로그아웃/다른 계정 → Reorder 버튼 숨김 확인
3. Reorder Save 실패 UX(Retry) 유지 확인

## 13) Ops Hardening (2026-02-14)
### Supabase Migration Guard
- File: `src/lib/supabase/migrationGuard.ts`
  - Checks:
    - `artworks.visibility = 'draft'` queryability
    - `artist_sort_order` column existence
    - DELETE permission/RLS policy errors (permission/policy detection)
- UI: `src/components/MigrationGuard.tsx`
  - Mounted at layout
  - 5-min TTL cache to reduce noise
  - Dev: console.warn + toast `Supabase migration not applied: <migration_name>`
  - Prod: console.error only (no toast)
- Wired in: `src/app/layout.tsx`

### Reorder Save Failure UX
- On save failure:
  - Reorder mode stays ON (no rollback)
  - Error message + Retry button
- i18n keys:
  - `profile.reorderSaveFailed`
  - `common.retry`

### Delete: Orphan Minimization (Logging)
- In `deleteArtworkCascade`, when storage remove fails:
  - Logs include `paths`
  - Dev: `console.warn` + `logPayload` object
  - Prod: `console.error` + `JSON.stringify(logPayload)`
  - Payload schema: `{ event:"storage_delete_failed", artworkId, paths, error }`

### QA Smoke Checklist
- Doc: `docs/QA_SMOKE.md`
- Covers: bulk pending/draft/delete/publish, artwork delete, reorder persist, i18n cookie persistence

---

## 15) People rebrand + role filters + profile/reorder entry

### Routing
- `/people` — People directory (new)
- `/artists` → 301 redirect to `/people`
- Header: "Artists" → "People", add "Profile" tab (links to /u/\<username>)

### People page (v1.14 — Recommended + Search, no full list)
- Tabs: **Recommended** (default), **Search** (when q present)
- Role multi-filter chips: Artist, Curator, Gallerist, Collector
- URL sync: `/people?tab=recommended&roles=artist,curator&cursor=<opaque>` or `?q=henry&tab=search&roles=...&cursor=...`
- **Recommended**: initial 15, Load more +10, excludes self + already followed; no full list when q empty
- **Search**: debounced search; q empty → Search results not fetched
- Cursor pagination (keyset: id desc)

### Data layer
- `src/lib/supabase/artists.ts`: `getRecommendedPeople`, `searchPeople` (RPC); `listPublicProfiles` removed
- RPC: `get_recommended_people`, `search_people` (Supabase)

### Entitlements + Profile Viewers (v1.14, no payments)
- `entitlements` table: user_id, plan (free|artist_pro|collector_pro), status, valid_until
- `profile_views` table: profile_id, viewer_id, created_at
- RPC: `get_profile_views_count`, `get_profile_viewers` (Pro only)
- `src/lib/entitlements.ts`: getMyEntitlements, hasFeature, ensureFreeEntitlement
- `src/lib/supabase/profileViews.ts`: recordProfileView, getProfileViewsCount, getProfileViewers
- Onboarding: ensureFreeEntitlement(userId) on completion
- `/me` insights card: Profile views (7d) count; free: CTA "Upgrade to see viewers"; Pro: recent viewers list

### /me entry
- "View public profile" → `/u/<username>`
- "Reorder portfolio" → `/u/<username>?mode=reorder`
- Username 없으면 "Complete profile" → /onboarding

### Deep-link
- `/u/[username]?mode=reorder` — owner면 reorder mode 자동 ON

---

## 16) Profile v0 + Completeness + Recommendation reasons (v1.15)

### Profile v0 fields (profile_v0_fields.sql)
- `profiles` 컬럼 추가: career_stage, age_band, city, region, country, themes, mediums, styles, keywords (text[]), education, residencies, exhibitions, awards (jsonb), profile_completeness (smallint), profile_updated_at
- 인덱스: themes, mediums, styles (gin), city

### Profile completeness
- `src/lib/profileCompleteness.ts`: computeProfileCompleteness(profile) → 0–100
- 규칙: username +10, display_name +10, avatar +10, bio +10, roles +10, city/region/country +10, themes≥3 +10, mediums≥1 +10, styles≥1 +10, education≥1 +10
- /settings 저장 시 profile_completeness + profile_updated_at 업데이트

### Settings UI
- Profile details 섹션 (접기/펼치기): career_stage, age_band, city/region/country, themes/mediums/styles/keywords (chip input), education (반복 폼)
- 상단에 Profile completeness 진행 바

### /me
- "Profile completeness: X/100" 카드 + "Improve profile" CTA → /settings

### People 추천 reason (설명 가능한 추천)
- `get_recommended_people` 반환: reason_tags (array), reason_detail (sharedThemesTop, sharedSchool)
- 규칙: role_match, same_city, shared_themes (≥2), shared_medium (≥1), shared_school (학교명 매칭)
- People 카드에 "Why recommended" 라인 표시 (Recommended 탭만)

