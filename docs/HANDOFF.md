# Abstract MVP — HANDOFF (Single Source of Truth)

Last updated: 2026-02-18

## 2026-02-18 — 이번 업데이트 전체 (Bugfix + 프로비넌스 네트워크 + 요청·확정 클레임 + 단일 드롭다운 UI)

### A. Bugfix: 외부 작가 → 온보딩 작가 전환 시 artist_id 미반영
- **현상**: (1) 외부 작가로 업로드된 작품이 온보딩 작가 피드에 자동으로 안 뜸 (2) 편집에서 온보딩 작가로 바꾼 뒤 저장해도 artist가 lister로 되돌아감
- **원인**: claim만 갱신하고 `artworks.artist_id`는 갱신하지 않음
- **수정**:
  - DB: `p0_claims_sync_artwork_artist.sql` — claims INSERT/UPDATE 시 `artist_profile_id`가 있으면 `artworks.artist_id` 자동 반영 트리거
  - 앱: `UpdateArtworkPayload`에 `artist_id` 추가, 편집 시 외부→온보딩 전환하면 payload에 `artist_id` 포함

### B. 프로비넌스 네트워크 (4): 아티스트 프로필 + 작품별 공개 설정
- **DB**: `artworks.provenance_visible` (boolean, default true). 마이그레이션: `p0_artworks_provenance_visible.sql`
- **편집**: 작품 수정에 "프로비넌스 공개 (큐레이터·소장자 등)" 체크박스 추가, 저장 시 `provenance_visible` 반영
- **프로필**: 아티스트/퍼블릭 프로필 작품 카드에 프로비넌스 블록 표시 (curated by, collected by, secured by 등)
- **비공개**: `provenance_visible = false`이면 작가 또는 해당 작품 claim 당사자만 프로비넌스 노출 (`canViewProvenance`)
- **구현**: `ArtworkProvenanceBlock`, `canViewProvenance`, `getProvenanceClaims`; ArtworkCard에 `viewerId` 전달 시 프로비넌스 표시

### C. 클레임 요청·확정 모델 (Request → Artist Confirm/Reject)
- **플로우**: 콜렉터/큐레이터/갤러리가 "확정 요청" 생성 → 작가가 승인(confirmed) 또는 거절(삭제). 프로비넌스에는 **confirmed** 클레임만 노출.
- **DB**: `claims.status` — `'pending' | 'confirmed'`, default `'confirmed'`. 마이그레이션: `p0_claims_status_request_confirm.sql`
  - RLS: 요청자(subject)만 insert/update/delete 본인 claim; 작가만 해당 작품의 pending claim 승인/거절.
  - SELECT: 공개는 `visibility = 'public'` 이고 `status = 'confirmed'`(또는 null)인 경우만; 요청자·작가는 pending 포함 조회 가능.
- **앱**: `createClaimRequest`, `confirmClaim`, `rejectClaim`, `listPendingClaimsForWork` (src/lib/provenance/rpc.ts). 프로비넌스/편집 권한은 `getConfirmedClaims` 기반(confirmed만).

### D. 작품 상세 클레임 UI — 단일 트리거 + 드롭다운 (심플 인터페이스)
- **트리거**: 버튼 하나 — "This artwork is…" / "이 작품은…". 클릭 시 드롭다운 열림, 바깥 클릭 시 닫힘.
- **드롭다운 옵션** (선택 시 해당 타입으로 확정 요청 생성):
  1. **owned by me** / 내가 소장 중입니다 (OWNS)
  2. **curated by me** / 내가 큐레이팅 했습니다 (CURATED)
  3. **exhibited by me** / 내 전시에 참여했습니다 (EXHIBITED)
- **노출 규칙**:
  - **소장(OWNS)**: 현재 로그인한 유저가 이미 이 작품에 OWNS 클레임을 보유한 경우에만 "owned by me" 옵션 **숨김**. 다른 계정이 볼 때는 "owned by me"가 보이므로 2·3차 소장자도 요청 가능.
  - **큐레이팅/전시**: CURATED·EXHIBITED는 동일 유저가 여러 번 요청 가능(여러 전시·여러 큐레이션 기록). 옵션은 항상 표시.
- **작가 전용**: 이 작품에 대한 "대기 중인 요청" 목록 + 각 요청에 **승인** / **거절** 버튼.
- **프로비넌스 히스토리**: confirmed 클레임만 목록에 표시; 동일 큐레이터의 여러 CURATED/EXHIBITED는 각각 별도 행으로 표시(날짜로 구분).
- **i18n**: `artwork.thisArtworkIs`, `artwork.ownedByMe`, `artwork.curatedByMe`, `artwork.exhibitedByMe` (en/ko).

### E. 피드·데이터
- **피드**: 최신 primary claim만 표기, 클레임 2개 이상이면 "+N more" 표시 (`FeedArtworkCard`)
- **데이터**: claims select에 `created_at`, `status` 포함; `ArtworkClaim` 타입에 `status` 추가

### F. Hotfix: RLS 무한 재귀 + ensure_my_profile 42804 (페이지 마비 해결)
- **증상**: 피드/전체 페이지 마비, "infinite recursion detected in policy for relation artworks", 500 (artworks), 400 (ensure_my_profile).
- **원인**:
  - **500 / 42P17 / 무한 재귀**: artworks SELECT 정책이 claims를 참조하고, claims SELECT 정책이 artworks를 참조 → RLS 평가 시 순환.
  - **400 / 42804**: `ensure_my_profile` 반환 타입과 `profiles.profile_completeness`(smallint) 불일치.
- **수정**:
  - `p0_claims_rls_break_recursion.sql`: `artwork_artist_id(work_id)` SECURITY DEFINER 함수 추가. claims 정책에서 `exists (select 1 from artworks ...)` 제거 후 `public.artwork_artist_id(work_id) = auth.uid()` 사용 → artworks 테이블을 정책 안에서 직접 읽지 않아 재귀 제거.
  - `p0_ensure_my_profile_return_type.sql`: `ensure_my_profile`에서 `profile_completeness::int` 캐스팅 및 null-uid 시 빈 결과 반환 유지.

### G. 픽스 배치 (삭제 권한 · Back 링크 · 원본 보기 · 모바일 헤더)
- **삭제 권한**: 아티스트가 아닌 업로더(리스터)도 해당 작품 삭제 가능. `canDeleteArtwork(artwork, userId)` 추가(artist 또는 claim subject). RLS는 기존에 이미 허용; UI만 `canDelete` 기준으로 삭제 버튼 노출.
- **Back 링크**: 작품 상세/수정에서 "Back to feed" 대신 **진입 전 페이지**로 복귀. `setArtworkBack(pathname)` / `getArtworkBack()` (sessionStorage). ArtworkCard, FeedArtworkCard, ArtistThreadCard, 업로드 성공 시 path 저장 → 상세에서 "← Back to My profile / Feed / People / …" 표시.
- **원본 크기 보기**: 작품 상세에서 **데스크톱(768px 이상)**만 이미지 클릭 시 원본 크기 라이트박스. Escape/배경 클릭으로 닫기.
- **모바일 헤더**: 우상단·모바일 메뉴 모두 **"My Profile"** 고정 표시 (기존 "Complete your profile" 제거). 링크는 그대로 `/my` 또는 `/onboarding`.

### H. 알림 (옵션 A: 아바타 배지 + 알림 페이지)
- **UI**: 헤더 아바타에 **읽지 않은 알림 개수 배지**(빨간 원). 아바타 클릭 시 드롭다운 상단에 "알림" 링크 → `/notifications`. 모바일 메뉴에도 "알림 (N)" 링크.
- **알림 종류**: 좋아요(내 작품), 신규 팔로우, 클레임 요청(작가에게), 클레임 승인/거절(요청자에게). DB 트리거로 자동 생성.
- **페이지**: `/notifications` — 목록 진입 시 전체 읽음 처리, `notifications-read` 이벤트로 헤더 배지 갱신.
- **DB**: `p0_notifications.sql` — `notifications` 테이블, RLS, 트리거(artwork_likes, follows, claims). 기존 테이블에 `read_at` 없을 수 있으므로 `add column if not exists read_at` 포함.
- **앱**: `src/lib/supabase/notifications.ts` (getUnreadCount, listNotifications, markAllAsRead), `src/app/notifications/page.tsx`, i18n `notifications.*`.

### 이번 릴리즈 Supabase SQL (수동 실행)
Supabase SQL Editor에서 아래 파일들을 **순서대로** 실행:
1. `supabase/migrations/p0_claims_sync_artwork_artist.sql`
2. `supabase/migrations/p0_artworks_provenance_visible.sql`
3. `supabase/migrations/p0_claims_status_request_confirm.sql`
4. `supabase/migrations/p0_claims_rls_break_recursion.sql`  ← **페이지 마비 해결**
5. `supabase/migrations/p0_ensure_my_profile_return_type.sql`  ← **400 ensure_my_profile 해결**
6. `supabase/migrations/p0_notifications.sql`  ← **알림(옵션 A)**

### 검증
- `npm run build` 통과 후 배포

### 이번 변경 반영 후 Git 명령어 (로컬에서 실행)
```bash
git pull origin main
git add -A
git status
git commit -m "feat: 픽스 배치(삭제 권한·Back 링크·원본 보기·모바일 헤더) + 알림 옵션 A"
git push origin main
```

## 2026-02-12 — P1: 온보딩/로그인 UX + 프로비넌스 표기 변경

- **로그인**: "Don't have an account?" 뒤 줄바꿈 → 회원가입 링크 다음 줄로 표시
- **프로비넌스 표기**: "Listed by X · Curated" → "curated by X" / "collected by X" / "secured by X" (INVENTORY=갤러리 인벤토리·컨사인먼트)
- `claimTypeToByPhrase()` 추가 (OWNS→collected, CURATED→curated, INVENTORY→secured)
- ArtworkCard, ArtistThreadCard 반영
- Supabase SQL: 없음 (앱/코드만 변경)
- Verified: `npm run build` 통과

## 2026-02-12 — 온보딩: 이메일·비밀번호 회원가입 (매직링크 대안)

- `/onboarding` 비로그인 시: 이메일, 비밀번호, username, display name, main role, roles 한 번에 입력 → `signUpWithPassword`로 계정 생성
- 매직링크는 유지; Supabase 정책 제한으로 초대 작가 온보딩 지연 시 하드 라우트로 바로 가입 가능
- 로그인 후 프로필 없을 때: `user_metadata`(username, display_name, main_role, roles)로 폼 프리필
- `/login`: "계정이 없으신가요? 이메일·비밀번호로 회원가입" → `/onboarding` 링크 추가
- Supabase SQL: 없음 (앱/코드만 변경)
- Verified: `npm run build` 통과

## 2026-02-17 — P0: Feed perf hotfix (thumb 폭발 억제 + image optimize)

- Feed 카드/리스트/프로필 그리드에서 `getArtworkImageUrl(..., "thumb")` 사용 (400px, quality 70)
- 작품 상세(`/artwork/[id]`)에서 `getArtworkImageUrl(..., "medium")` 사용 (1200px, quality 80)
- 아바타는 `"avatar"` variant (96px)
- next/image 적용: `unoptimized` 제거, `sizes`, `loading="lazy"`, 상단 2개만 `priority`
- next.config: `/storage/v1/render/image/public/**` remotePatterns 추가 (Supabase Image Transformations)
- Feed limit 80→50, discovery blocks 5→4
- 작품 수정 페이지(`/artwork/[id]/edit`)는 원본 이미지 사용 (변경 없음)
- Verified: `npm run build` 통과, /feed 네트워크 이미지 요청 수 감소 예상

## 2026-02-16 — P0: Profile save SSOT (single RPC) + remove PATCH /profiles + fix header flash/completeness init

- Enforced single write path: `supabase.rpc("upsert_my_profile")` for base+details+completeness (no direct PATCH/UPDATE to `profiles`)
- Removed legacy writes: no `supabase.from("profiles").update/upsert/insert` remain (read-only selects OK)
- Fixed UX: eliminated "Complete your profile" flash on refresh by gating Header on profile load
- Fixed completeness init: avoid defaulting to 0; show loading until profile hydrated
- DB migrations:
  - `p0_profile_ssot_single_rpc.sql` (upsert_my_profile security definer + grants)
  - `p0_profiles_username_autogen.sql` (auto-generate username on insert if missing)  [if applied]
- Verified:
  - Local `npm run build` passes
  - Vercel deploy passes
  - Supabase logs show no PATCH /profiles on save

## 2026-02-16 — P0: Main profile save fixed (RPC only) + username invariant enforced

- **Code**: Main profile save now uses a single function `saveMyProfileBaseRpc(payload)` in `src/lib/profile/saveProfileBase.ts`, which calls `supabase.rpc("update_my_profile_base", { p_patch, p_completeness })` and returns refreshed profile via `getMyProfile()`. No direct PATCH/UPDATE to `profiles` for main profile save.
- **Settings**: Main profile section and details section save via `saveMyProfileBaseRpc` + `saveProfileDetailsRpc` (update_my_profile_base + update_my_profile_details). Onboarding still uses `saveProfileUnified` (upsert_my_profile) to set username on first signup.
- **DB migrations**:
  - `p0_profiles_username_backfill.sql`: backfill existing rows with null username (`user_` + first 12 hex chars of id).
  - `p0_profiles_username_autogen.sql`: BEFORE INSERT trigger sets username to `user_` + first 12 hex of id when null (invariant for new rows).
- **RPC**: `update_my_profile_base` (p0_fix) is SECURITY DEFINER, does not overwrite username, uses `ensure_profile_row()` so profile row exists; returns updated row.
- **Verified**: (1) Existing account: edit main profile → Save → success, no PATCH in logs. (2) New account: profiles row exists (ensure_profile_row / trigger), edit main profile → Save → success. (3) Supabase logs: no PATCH /rest/v1/profiles for main profile save; only RPC calls.
- **Remaining**: Onboarding sets username via `upsert_my_profile` (p_base.username). Details save uses `update_my_profile_details` RPC.

## 2026-02-16 — P0: Fix TS build by aligning Profile type with DB (profile_completeness)

- **Type SSOT**: Added and exported canonical `Profile` type in `src/lib/supabase/profiles.ts` with `profile_completeness`, `profile_details`, `education`, `roles`, and all columns from `PROFILE_ME_SELECT`. Settings and other consumers import `type Profile` from profiles.
- **getMyProfile()**: Return type set to `Promise<{ data: Profile | null; error: unknown }>`. Select already included `profile_completeness` via `PROFILE_ME_SELECT`; no select change. Result cast to `Profile | null` for type safety.
- **settings/page.tsx**: Removed local `Profile` type; import `Profile` from `@/lib/supabase/profiles`. Dropped unnecessary `refreshed as Profile | null` cast; `ref` is now correctly typed from `getMyProfile()`.
- **Verified**: `npm run build` passes.

## 2026-02-16 — P0: Main profile save fixed (no PATCH; RPC-only; username NOT NULL guarded)

- **Root cause**: PATCH /rest/v1/profiles (or RPC payload) was sending `username: null`/empty → DB NOT NULL violation (23502). In `upsert_my_profile`, when `p_base` contained key `username` with value `""` or null, the RPC set `username = nullif(trim(...), '')` → null.
- **Fix summary**:
  - **RPC**: New migration `p0_profiles_username_never_null_rpc.sql` — `upsert_my_profile` now sets `username` only when `p_base` supplies a non-empty value; otherwise `username = coalesce(v_username, p.username)` so existing username is never overwritten with null.
  - **Client**: `compactPatch()` in `saveProfileBase.ts` and `profileSaveUnified.ts` strips `null`/`undefined`/`""` from payloads before RPC. Main profile save does not send `username` (whitelist excludes it in saveMyProfileBaseRpc); unified path only includes `username` when caller provides a non-empty value (e.g. onboarding).
  - **DB**: Trigger `p0_profiles_username_autogen` (BEFORE INSERT) already ensures new profile rows get a generated username when null.
- **Verification**: `npm run build` passes. Manual: login → change display_name/bio/location → Save → DB updates; no PATCH /profiles in Network tab; Supabase logs show only RPC calls.

## 2026-02-16 — P0: Unblock profile save (education NOT NULL) + payload null stripping

- **Root cause**: `profiles.education` (jsonb) was NOT NULL; main profile save sent `education:null`, causing Postgres 23502 and 400 on save.
- **DB**: Dropped NOT NULL constraint on `public.profiles.education` (`p0_profiles_education_drop_notnull.sql`) to allow empty education.
- **Client**: Hardened save payload by stripping `null`/`undefined`/`""` keys; optionally strips empty `[]` and `{}`; explicitly removes `education` when null; removes readonly fields (`id`, `username`, `profile_updated_at`, `profile_completeness`, `profile_details`) from basePatch in both `saveProfileBase.ts` and `profileSaveUnified.ts`.
- **Verified**: Profile save succeeds; no PATCH /profiles; no 23502.

## 2026-02-16 — P0: Multi-account save fix + invariant summary

- **Bug**: Save still fails for some accounts (e.g. henrykimceo) after education nullable hotfix. Possible causes: another NOT NULL column (23502), RLS/permission (42501), or stale profile.id after account switch.
- **Investigation**: Save path uses RPC only (no PostgREST PATCH /profiles). `saveMyProfileBaseRpc` → `update_my_profile_base`; `saveProfileDetailsRpc` → `update_my_profile_details`; Onboarding → `upsert_my_profile`. All RPCs use `auth.uid()` internally (ME-only), never accept user_id from client.
- **Account switching**: `AuthBootstrap` calls `router.refresh()` on SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED. Settings has UID mismatch check: if `currentProfile?.id !== uid`, refetches and if still mismatch shows "Session/profile mismatch. Reloaded; try again." and `router.refresh()`.
- **Final invariant**:
  1. No PostgREST writes to `profiles` — all profile saves go through RPC (`update_my_profile_base`, `update_my_profile_details`, `upsert_my_profile`).
  2. Optional fields are nullable or defaulted — `education` NOT NULL dropped; `username` guarded by RPC coalesce + trigger; `compactPatch` strips null/undefined/"" before RPC.
  3. ME-only RPC — all RPCs use `auth.uid()`; never `PATCH /profiles?id=eq.<id>`.

## 2026-02-16 — v1.15: SSOT save hard stop (no PostgREST profiles write)

- **Full audit**: No `.from("profiles").update/upsert/insert/delete` or `fetch(/rest/v1/profiles)` in codebase. Profiles reads only (select); writes via RPC.
- **Runtime hard stop**: `src/lib/supabase/client.ts` wraps `global.fetch`; blocks any request where URL contains `/rest/v1/profiles` AND method is PATCH/POST/PUT/DELETE. Throws with message `[SSOT] Blocked: profiles write via PostgREST; use rpc("upsert_my_profile") only`. Logs `{ url, method, stack }` to console.
- **Save path**: Single RPC `upsert_my_profile` (base+details+completeness); Settings main save also uses `update_my_profile_base` + `update_my_profile_details`. All ME-only (`auth.uid()`).
- **Failure logging**: `saveMyProfileBaseRpc` and `profileSaveUnified` already log `{ message, code, details, hint }` on RPC failure.

## 2026-02-16 — P0: Profile save debug visibility + RPC/RLS hardening for remaining 400s

- **Structured error logging**: Added `ProfileSaveError` type; `saveProfileUnified` returns `{ ok: false, code, message, details, hint, step: "unified_upsert" }` instead of throwing. Console logs `{ rpc, argsKeys, code, message, details, hint }`.
- **Unified save path**: Settings now uses `saveProfileUnified` only (base + details + completeness in one RPC). Replaced `saveMyProfileBaseRpc` + `saveProfileDetailsRpc` with single `saveProfileUnified`. Onboarding and profiles.ts already used `saveProfileUnified`.
- **Error UI**: On failure, Settings shows `Save failed: <code> <message>`. DEV: DebugPanel with details/hint and Copy debug button.
- **DB hardening**: `p0_profile_bootstrap_rpc_harden.sql` — `ensure_my_profile` delegates to `ensure_profile_row` (username-safe insert); re-grants on `ensure_my_profile`, `upsert_my_profile`, `update_my_profile_base`, `update_my_profile_details` to authenticated.
- **Verified**: Save succeeds for problematic accounts; no PATCH /profiles; logs show only RPC calls.

## 2026-02-16 — P0: Fix RPC save failure 42804 (main_role enum vs text CASE mismatch)

- **Root cause**: Postgres 42804 "CASE types main_role and text cannot be matched". `profiles.main_role` is enum; RPC used `p_base->>'main_role'` (text) in CASE without casting.
- **Fix**: `p0_fix_main_role_case_cast.sql` — parse `v_main_role := nullif(trim(coalesce(p_base->>'main_role','')), '')` and set `main_role = case when v_main_role is not null then v_main_role::public.main_role else p.main_role end` so both branches return enum.
- **RPCs patched**: `upsert_my_profile`, `update_my_profile_base`.
- **Verified**: siennako can save base/details; other accounts unchanged; still no PostgREST PATCH writes.

## 2026-02-16 — Batch A: Profile Details CTA + completeness init (no more 0 on first login)

- **Settings UX**: Replaced subtle "Profile details" label with a clear CTA button: "Add profile details" (primary style) when empty; "Edit profile details" (secondary) when details exist. Button toggles accordion and scrolls into view.
- **Completeness init fix**: Removed `0` fallback while loading/unknown; render "—" until hydrated. Bar width uses 0 when loading or `profile_completeness == null`. If DB completeness is null, compute once after hydration (confidence-gated) and persist via `persistCompletenessOnly` RPC (best-effort). SessionStorage key `ab_pc_init_<uid>` prevents loops; cleared on sign-out.
- **persistCompletenessOnly**: Added to profileSaveUnified; calls `saveProfileUnified({ basePatch: {}, detailsPatch: {}, completeness })`.
- **Verified**: No 0-flash on first login; saves remain RPC-only; no PostgREST writes to `/profiles`.

## 2026-02-16 — P0: Upload provenance hotfix (Collector/Curator/Gallerist) + 페르소나 확장

- **Hotfix (DB)**: `p0_upload_provenance_hotfix.sql` — (1) `ensure_my_profile`: return empty instead of raise when `auth.uid()` null (prevents 400); (2) artworks: SELECT public/own/claim, INSERT authenticated, DELETE artist-or-lister; (3) artwork_images: INSERT when artist OR has claim (collector/curator can attach).
- **Upload flow fix**: Claim 생성 순서를 이미지 첨부 **이전**으로 변경 — RLS가 claim 기반으로 artwork_images INSERT를 허용하므로, claim을 먼저 만들어야 함. 실패 시 에러에 code 포함 표시.
- **deleteArtwork**: artist_id 필터 제거, RLS로 삭제 권한 판단 (artist 또는 lister).
- **Upload UX 확장**: Intent — Gallery inc. inventory (INVENTORY), Curated/Exhibited (CURATED) 병합. CREATED 외에는 모두 Attribution(작가 연결) 필수. Attribution 단계 렌더 조건 `intent === "OWNS"` → `needsAttribution(intent)` 수정으로 INVENTORY/CURATED 선택 시 빈 화면 버그 해결.
- **Collector 프로필**: `listPublicArtworksListedByProfileId` 추가 — claims.subject_profile_id 기반. 프로필 페이지에서 artist 작품 + lister 작품 병합 표시. ArtworkCard "Listed by"에 리스터 프로필 링크 추가.
- **Gallery label**: "Gallery (inc. inventory)".
- **페르소나 탭**: 공개 프로필 및 My 페이지에 전체 | 내 작품 | 소장품 | 갤러리 | 큐레이션/전시 탭 추가. `personaTabs.ts` 공유, claim_type 기반 필터.
- **My 페이지**: `listPublicArtworksListedByProfileId`로 리스팅 작품 병합, 탭으로 페르소나별 필터.
- **Pending**: External artist 초대(이메일/연락처로 초대 링크 발송) — 아직 미구현, 홀드. 프로젝트 연결(Curated), 벌크 업로드 페르소나 UI.
</think>

## 2026-02-16 — Batch B: Price multi-select, artwork aspect, upload redirect, reorder UX

- **Price band**: Multi-select (max 5) via TaxonomyChipSelect. DB stores `price_band` as string[] in profile_details. Backward compat: string→array when reading.
- **Artwork aspect ratio**: `object-cover` → `object-contain` on ArtworkCard, ArtistThreadCard, artwork detail page so non-square images display without cropping.
- **Upload**: After successful upload, redirect to `/u/{username}` (public profile) instead of artwork detail.
- **Reorder**: Save/Cancel buttons moved above the artwork grid (where Reorder button was).

## 2026-02-16 — My/Settings UX: completeness compact status + i18n

- **My page**: Moved Profile completeness from large top block to compact status in header (top-right, next to action buttons). Small label "Profile completeness" + icon bar + "X/100" or "—", click → /settings, hover shows hint.
- **Settings**: Edit profile details button size reduced (inline-block, py-2) to match other action buttons.
- **Settings i18n**: "Edit profile details" KO → "상세 프로필 수정".

## 2026-02-16 — Completeness: compute-only on /my, persist only on save

- **My page**: Completeness is computed from profile data on load and displayed. No DB write on /my load. Removed `persistCompletenessOnly` call and `ab_pc_init_*` sessionStorage logic.
- **Settings / Onboarding**: Completeness is computed and persisted only when user saves (via `saveProfileUnified`).
- **Display**: Treat 0 same as null — show "—" when completeness is 0 or null. Bar width 0 for empty.
- **ProfileBootstrap**: Removed `ab_pc_init_*` cleanup on sign-out (no longer used).
- **Verified**: No 0 flash on new login; DB completeness updated only on save; RPC-only.

---

## 표준 워크플로우 (Standard Workflow)

코드 변경 후 다음 순서로 진행:

1. **로컬 빌드**: `npm run build`
2. **Git 커밋 및 푸시**: `git status && git add -A && git commit -m "<메시지>" && git push origin main`
3. **HANDOFF.md 업데이트**: 변경 내용을 상단에 새 섹션으로 추가

---

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

### Navigation (v5.2)
- Header logo routes to `/feed`
- Logged-in nav order: **Feed** → **People** → **Upload** (main tabs) || **My Profile** → **EN/KR** → **Avatar menu**
- **Settings** is NOT a top-level tab; Settings and Logout live in **Avatar dropdown** (Update profile → /settings, Logout at bottom, danger)
- My Profile or "Complete profile" links to /my or /onboarding (no duplication with onboarding CTA)
- Mobile: same IA; Settings only inside avatar/account menu
- `/me` → redirect(`/my`) (legacy alias)
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
  - public profile shows: avatar, display_name, @username, bio (whitespace-pre-line for line breaks), roles, website/location (if present)
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
- `/my` (primary): Profile header. **Edit profile (Settings)** primary CTA; View public profile secondary. KPI: Following, Followers, Posts. Profile completeness from `profiles.profile_completeness`. Bulk delete (multi-select). `listMyArtworks({ publicOnly: true })`.
- `/me` → redirect `/my` (legacy). `/my/followers`, `/my/following` — lists with Follow button.
- Mobile: My Profile / Complete profile appears once (no duplicate).

### Settings UX
- `/settings` save redirects to **/u/<username>**
- **Log out** button at bottom (signOut → redirect /login)
- One-time banner: "Profile updated" (sessionStorage flag)
- MigrationGuard warnings do not block UI

### v5.6 Profile Stability Gate (bootstrap + header gate)
- **ProfileBootstrap**: 앱 시작 시 `ensure_my_profile` RPC 1회 호출 — profiles row 보장
- **ensure_my_profile()**: INSERT ... ON CONFLICT (id) DO UPDATE, auth.uid() 기반
- **Header gating**: profile 로딩 중에는 "My Profile" 표시 → "Complete your profile" flash 제거
- **Save gating**: session?.user?.id 없으면 저장 차단, "Please try again" 메시지

### v5.5 Profile Save Guaranteed (UPSERT RPC)
- **Base + Details**: 둘 다 INSERT ... ON CONFLICT (id) DO UPDATE로 UPSERT
- **상황 대응**: (a) profile row 없음, (b) profiles.id 불일치, (c) RLS update 차단 → 모두 저장 성공
- **마이그레이션**: `supabase/migrations/profiles_upsert_rpc.sql` — Supabase SQL Editor에서 수동 실행
- **Backend**: profiles 단일 테이블 + profile_details jsonb + 2개 RPC

### v5.4 Profile Save Root Fix
- **Base save**: `update_my_profile_base` RPC (auth.uid() 기반, 프론트 `.from('profiles').update()` 제거)
- **Details save**: `update_my_profile_details` RPC (동일)
- **profileSave.ts**: `saveProfileBaseRpc(basePatch, completeness)`, `saveProfileDetailsRpc(detailsPatch, completeness)` — Settings/MyProfile 모두 사용
- **Build stamp**: `NEXT_PUBLIC_BUILD_STAMP` (Vercel env) → Header dropdown + Settings 상단 우측 + console.info on mount
- **Loading skeleton**: `src/app/my/loading.tsx` — My Profile 로딩 시 flash 최소화
- **Completeness sync**: RPC 반환값으로 profile_completeness 즉시 갱신; My Profile/Settings 동일 숫자 표시

### Profile details (profiles.profile_details jsonb, v5.1 / v5.2 / v5.3)
- Details in `profiles.profile_details` jsonb; **single save path**: RPC `update_my_profile_details` (merge semantics)
- `updateMyProfileDetailsViaRpc(detailsJson, completeness)` in `src/lib/supabase/profileDetails.ts`; base update does NOT touch profile_details
- Completeness sync: Settings and /my both read `profile_completeness` from DB; no local override. Save flow refreshes initial refs from DB return payload.
- **Completeness overwrite guard (v5.3)**: Never write 0 unless confidence=high. `computeProfileCompleteness()` returns `{ score, confidence }`; when confidence=low (base not loaded, details not loaded), score=null and we omit `profile_completeness`. Only return 0 if profile is truly empty. UI shows "—" when null/undefined.
- **Selectors**: `src/lib/supabase/selectors.ts` exports `PROFILE_ME_SELECT`; getMyProfile and base update use it for consistent profile_completeness + profile_details reads.
- **Save timeouts (v5.3-r1)**: base_update 10s, details_rpc 25s (avoid spurious timeouts).
- **Retry details UX**: When base saved but details failed, inline panel shows "Retry details" button; retry calls details RPC only.
- **Details payload**: compact diff (only changed keys); omit empty arrays/strings to minimize payload.
- **v5.3 Profile Save Patch**:
  - Root cause: full-payload update included problematic fields; patch update prevents invalid fields from being sent.
  - `makePatch(initial, current)` in `src/lib/profile/diffPatch.ts` returns only changed keys.
  - `updateMyProfileBasePatch(patch)` sends only changed base fields (no full payload).
  - Details saved via `updateMyProfileDetails(patch, completeness)` — merge RPC with patch only.
  - No changes Save => "No changes to save", no network/DB calls.
  - PROD: generic error messages only; DEV: Debug panel shows step, supabaseError, patch.

### Bio newlines (v5.2)
- Bio textarea preserves Enter/newlines; `normalizeBioString` trims edges only, preserves internal `\n`
- Display: `whitespace-pre-line` on profile header, people cards, feed thread cards; 2-line previews use `whitespace-pre-line line-clamp-2`

### Profile taxonomy & persona modules
- **Single source of truth**: `docs/PROFILE_TAXONOMY.md` + `src/lib/profile/taxonomy.ts`
- Profile details (Settings): Core + Artist/Collector/Curator modules (역할별 optional). Save 전 `sanitizeProfileDetails` 적용; Dev 저장 실패 시 error detail 로그.
- **Failure logging (v5.3)**: On save failure, `console.error` logs structured event; details failure: `{ event: "details_save_failed", ms, step, code, message, details, hint }` with duration. Dev DebugPanel shows step, duration (ms), RPC name+args (for details_rpc), full supabaseError.

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
  - profiles.profile_details 컬럼 존재
  - update_my_profile_details RPC 존재
  - update_my_profile_base RPC 존재 (v5.4)
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

## 2026-02-16 — Hotfix: main build broken in Settings (missing updateMyProfileDetails symbol)

- Fixed TS compile error in src/app/settings/page.tsx by using the correct details-save function (saveProfileDetailsRpc), replacing stale symbol `updateMyProfileDetails`.

## 2026-02-16 — Hotfix: ProfileBootstrap build fix

- Fixed TS build error in ProfileBootstrap by removing .catch() on PromiseLike and using async IIFE with try/catch (fire-and-forget).

## 2026-02-16 — Hotfix: diffPatch TS build fix

- Fixed TS error in makePatch by stringifying keyof before indexing Record<string, unknown>.

## 2026-02-16 — Emergency: restore deploy without PR (PR creation suspended)

- GitHub account blocked from opening PRs, so we pushed build-fix commits directly to main.
- Fixed Settings stale symbol reference, ProfileBootstrap PromiseLike catch, and diffPatch keyof indexing TS error.
- Next step after deploy: address profile save + completeness/flash issues (functional).

## 2026-02-16 — P0: Profile details SSOT stabilized

- Enforced single SSOT for profile details: `profiles.profile_details` (jsonb).
- Removed/ignored any legacy `profile_details` table reads/writes in app layer.
- Settings/My/Header now read via `getMyProfile()` + `PROFILE_ME_SELECT` consistently.
- Save flow: treat RPC success as success, then re-fetch profile once to prevent false failure UI.
- Header: tri-state gating prevents "Complete your profile" flash during profile load.

## 2026-02-16 — P0: main-only hotfix for profile save failures

- Stopped branch/PR workflow due to PR creation suspension.
- Added explicit auth session guard + real error logging in Settings save handler to diagnose and prevent auth.uid() null RPC failures.

## 2026-02-16 — P0: Profile save unblocked (RLS + SSOT alignment)

- Confirmed Settings reads from legacy `public.profile_details` table; aligned details save path to the same SSOT.
- Added RLS policies for `profiles` and `profile_details` to allow authenticated users to select/insert/update own rows.
- Marked key RPCs as SECURITY DEFINER (best-effort) and granted execute/CRUD to authenticated to prevent silent write blocks.
- Removed confusing "local" badge fallback when NEXT_PUBLIC_BUILD_STAMP is not set.

## 2026-02-16 — P0: unified profile save to upsert_my_profile

- Unified profile save to single RPC (upsert_my_profile) to avoid PostgREST 42702/42804 from legacy update_my_profile_base / update_my_profile_details.

### 2026-02-16 — P0: Main profile save unblocked (RPC-only; prevent username null overwrite)

- Root cause: Settings main profile save used `PATCH /rest/v1/profiles`, sending `username: null/undefined`, violating NOT NULL (23502).
- Fix: Removed direct `profiles` PATCH path; main profile save now calls `rpc('update_my_profile_base')` with a whitelist patch payload (no username/id/readonly fields).
- Result: Main profile saves succeed; details saves remain RPC-based; UI refresh via `getMyProfile()` after save.

### 2026-02-16 — P0: Cross-user save bug fixed (uid guard + auth bootstrap; ME-only RPC saves)

- Root cause: After account switch, Settings save used stale profile.id and issued PATCH `/rest/v1/profiles?id=eq.<old-uid>`, causing writes to wrong row and NOT NULL username failures (23502).
- Fix: Main/details saves are ME-only RPC calls (auth.uid on DB). Added `requireSessionUid()` and uid mismatch guard. Added AuthBootstrap `onAuthStateChange` to clear profile caches and `router.refresh()` on SIGNED_IN/SIGNED_OUT.
- Result: User A/B switching no longer leaks old uid; both main and details saves succeed.

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
