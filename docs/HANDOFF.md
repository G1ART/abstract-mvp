# Abstract MVP — HANDOFF (Single Source of Truth)

Last updated: 2026-02-15 (America/Los_Angeles)

## 1) Project identity
- Product: **Abstract** (art platform MVP)
- Goal: 빠르게 작품을 올리고(아카이브), 사람을 발견하고(팔로우/디렉토리), 작품을 탐색(피드)하는 최소 기능을 안정적으로 제공
- Current theme: **추천(Recommended) + 유료화 기반(Entitlements/Viewers) + 프로필/추천 데이터 강화**

## 2) Repo / Branch / Local
- GitHub repo: `G1ART/abstract-mvp`
- Branch: `main` (assumed)
- Local project folder: TODO

## 3) Production / Deploy
- Vercel Production URL: **https://abstract-mvp-5vik.vercel.app**
- Vercel project name: TODO
- Root Directory (Vercel): TODO (usually ".")

## 4) Tech stack
- Next.js (App Router)
- Supabase (Auth, Postgres, Storage, RLS, RPC)
- Vercel (deploy)
- i18n: cookie `ab_locale` + middleware defaulting

---

## 5) Current MVP capabilities (what works)

### Auth / Onboarding
- Email magic link login
- Onboarding creates/updates profile:
  - `username` required (3–20, lowercase/num/_)
  - `main_role` (single) + `roles` (multi, min 1)
- Password setup:
  - `/set-password` page via `supabase.auth.updateUser({ password })`
  - localStorage flag `has_password` (MVP enforcement)

### Navigation
- Header logo routes to `/feed`
- Logged-in nav includes: Feed / People / Profile(/u/<username>) / Upload / Settings / **My Profile** (near language toggle)
- `/me` → redirect(`/my`) (legacy alias, old links preserved)
- `/artists` → redirect(`/people`) (legacy alias)

### Feed (Thread style)
- `/feed` shows artist-centric thread cards:
  - avatar, display_name, @username, bio(2-line), Follow button
  - mini gallery thumbnails (up to 6 artworks)
  - “View profile” link
- Tabs: All / Following
- Sort: Latest / Popular (popular uses likes_count sorting before grouping)
- Refresh + window focus refetch

### Profiles
- `/u/[username]`:
  - public profile shows: avatar, display_name, @username, bio, roles, website/location (if present)
  - shows that artist’s public artworks
  - FollowButton when viewer is not self
- Private profile:
  - non-owner sees “This profile is private.”
  - owner can still view own profile (self-view exception)
- Deep-link:
  - `?mode=reorder` can enter reorder mode for owner if public works exist

### People directory (3-lane recs + Search)
- `/people`:
  - 3-lane 추천(순서 고정):
    1) From people you follow — Your followers follow these people
    2) Based on what you like
    3) A bit different, still your vibe
  - lane별 segmented control + URL sync (`?lane=follow|likes|expand`)
  - q가 있으면 Search 모드로 전환 (search_people RPC)
  - roles 멀티 필터 + Load more (initial 15, +10)
- RPC: `get_people_recs(p_mode, p_roles, p_limit, p_cursor)` (supabase/migrations/people_lanes_rpc.sql)

### Artworks
- Upload flow:
  - upload image to Supabase storage bucket `artworks`
  - create artwork record + attach artwork_images row
- Artwork detail supports likes and view events (de-dup TTL logic)
- Pricing_mode fixed/inquire, price visibility supported
- USD baseline, KRW input converts to USD using env rate (MVP)

### Likes
- `artwork_likes` table
- likes_count normalized in code to avoid postgrest shape issues
- Popular sorting based on likes_count

### My dashboard (/my)
- `/my` (primary): Profile header, View public profile / Edit profile. KPI: Following, Followers, Posts. Profile completeness from DB. Bulk delete (multi-select). `listMyArtworks({ publicOnly: true })`.
- `/me` → redirect `/my` (legacy). `/my/followers`, `/my/following` — lists with Follow button.

### Settings UX
- `/settings` save redirects to **/u/<username>**
- One-time banner: “Profile updated” (sessionStorage flag)
- MigrationGuard warnings do not block UI

### Profile taxonomy & persona modules
- **Single source of truth**: `docs/PROFILE_TAXONOMY.md` + `src/lib/profile/taxonomy.ts`
- Profile details (Settings): Core + Artist/Collector/Curator modules (역할별 optional). Save 전 `sanitizeProfileDetails` 적용; Dev 저장 실패 시 error detail 로그.

---

## 6) Bulk Upload + Draft System (v1.12)
- Route: `/upload/bulk`
- Flow:
  1. Pending queue (pre-upload remove individual/all)
  2. Start Upload → draft 생성 + 이미지 업로드/첨부
  3. Apply-to-all metadata
  4. Publish panel (validatePublish) 통과 시 publish
  5. Publish 후 public feed 노출

- Data layer (src/lib/supabase/artworks.ts):
  - createDraftArtwork, updateArtwork, listMyDraftArtworks, publishArtworks, validatePublish

---

## 7) Delete / Cleanup (hard delete)
- `/artwork/[id]` owner-only delete (confirm → cascade → redirect `/my`)
- `/my` bulk delete: multi-select mode → Select → checkboxes → Delete selected → confirm ("Delete N posts?") → `deleteArtworksBatch(ids, { concurrency: 5 })` → refresh
- Draft delete: bulk page에서 selected/all delete
- Cascade delete:
  - storage files → artwork_images rows → artworks row
  - storage delete 실패 시 로그(Dev warn/Prod error + payload)
- Bulk delete: `deleteArtworksBatch(ids, { concurrency: 5 })` — `deleteArtworkCascade` per id with concurrency limit

- Supabase SQL scripts (manual apply):
  - `supabase/migrations/artwork_delete_rls.sql`
  - `supabase/migrations/artwork_delete_storage.sql`

---

## 8) Portfolio Reorder (v1.13)
- DB migration:
  - `artist_sort_order bigint NULL`
  - `artist_sort_updated_at timestamptz DEFAULT now()`
  - index (artist_id, artist_sort_order ASC NULLS LAST, created_at DESC)
- UI:
  - owner-only reorder mode (`@dnd-kit/*`)
  - Save/Cancel; 실패 시 retry UX 유지
- Manual step:
  - Supabase SQL Editor run `supabase/migrations/artworks_artist_sort_order.sql`

---

## 9) Supabase DB / Storage / RLS / RPC (critical)

### Tables in use
- profiles
- follows
- artworks
- artwork_images
- artwork_views
- artwork_likes
- entitlements
- profile_views

### Storage
- bucket: `artworks` (public)

### RPC (must exist)
- `public.lookup_profile_by_username(text) returns jsonb`
  - public profile => returns profile payload incl `is_public=true`
  - private profile => returns `{ "is_public": false }`
  - not found => returns null
- People:
  - `public.get_people_recs(p_mode text, p_roles text[], p_limit int, p_cursor text)` — 3-lane recs (follow_graph|likes_based|expand)
  - `public.get_recommended_people(roles text[], limit int, cursor text)` (레거시)
  - `public.search_people(q text, roles text[], limit int, cursor text)`
  - NOTE: roles 필터에서 `main_role::text` / `roles::text[]` 캐스팅 적용 완료 (operator mismatch 해결)
- Viewers:
  - `get_profile_views_count`, `get_profile_viewers` (Pro만)
- Entitlements:
  - `entitlements` table + `ensureFreeEntitlement` app-layer

---

## 10) Migration Guard (Supabase Migration Guard)
- `src/lib/supabase/migrationGuard.ts` 점검:
  - artworks.visibility='draft' 쿼리 가능 여부
  - artist_sort_order 컬럼 존재
  - policy/permission 관련 에러 감지
- `src/components/MigrationGuard.tsx`: layout 마운트, 5분 TTL 캐시
  - Dev: toast + console warn
  - Prod: console.error only
- `src/app/layout.tsx`: MigrationGuard 추가

---

## 11) Entitlements + Profile Viewers (monetization skeleton)
- entitlements: `user_id, plan, status, valid_until`
- profile_views: `profile_id, viewer_id, created_at`
- ProfileViewTracker: 프로필 조회 기록(30분 TTL, 로그인 시만)
- `/me` 인사이트 카드:
  - Free: count만 + upgrade CTA
  - Pro: 최근 viewer 리스트 + see all

---

## 12) QA Smoke
- `docs/QA_SMOKE.md` 참고:
  - Bulk pending/draft/delete/publish
  - artwork delete
  - reorder persist
  - i18n cookie
  - People 추천/검색/load more
  - viewers entitlement

---

## 13) KPI Dashboard (Investor-facing)
- `docs/KPI_DASHBOARD.md` 추가:
  - North Star(qualified connections)
  - 공급/수요(Artist/Discovery MAU)
  - 리텐션(D7/D30)
  - 추천 레인 CTR/Serendipity
  - 유료 intent(Upgrade CTA, viewer unlock)
  - Instrumentation plan(이벤트 표준)

---

## 14) Next: AI Recs v0 skeleton (planned)
목표: “OpenAI 호출을 당장 붙이지 않고”, 임베딩 테이블 + taste profile + 3 레인 UI부터 깔기.
- DB:
  - `artwork_embeddings` (pgvector)
  - `user_taste_profiles` (taste embedding + debug)
- App:
  - like 이벤트 후 taste profile best-effort 업데이트(임베딩 없으면 debug 카운터)
  - feed 레인 3개: For You / Expand / Signals (초기 룰 기반, 나중에 임베딩으로 교체)
- Guard:
  - MigrationGuard에 vector/tables 존재 체크 추가

---

## 15) Operating notes (how to ship)
- Code changes: commit/push → Vercel auto deploy
- SQL/RPC changes: Supabase SQL Editor에서 수동 실행(배포와 별개)
- Pre-deploy sanity:
  - `npm run build` (가능한 경우)
  - env vars in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Prod/Preview/Dev)

---

## 16) Current issues / risks
- has_password localStorage 기반(MVP). 장기적으로 DB flag로 이동 고려.
- Popular sorting client-side. 데이터 커지면 server ranking 필요.
- People 추천은 현재 룰 기반 + fallback. 향후 AI Recs v0로 고도화 필요.
- UUID id 기반 cursor는 추천에 최적은 아님(추후 created_at + id keyset 고려).

---

## 17) Immediate next steps (recommended)
P0:
1) AI Recs v0 skeleton 구현(임베딩 테이블 + taste profile + 3 레인 UI)
2) KPI instrumentation events 최소 세트 정의/로깅(주간 집계 가능 형태)
3) Profile v0 fields + completeness + 추천 reason 강화(진행 중/다음 스프린트로)

P1:
- Embedding batch job(서버리스/크론) 연결
- Serendipity/diversify 로직 정교화
- 결제/플랜 연동(Stripe) 및 entitlement enforcement 강화
