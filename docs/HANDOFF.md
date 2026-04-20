# Abstract MVP — HANDOFF (Single Source of Truth)

Last updated: 2026-04-19

## 2026-04-19 — Onboarding Front Door Finalization Patch

브랜치: 현재 작업 브랜치.

### 0. 한 줄 요약
> "비회원은 한 가지 길만 본다: `/` → `/onboarding` → `/onboarding/identity`. `/login` 은 기존 회원 전용, 매직링크는 접어둔 보조 옵션으로만 존재한다."

### 1. Front-door IA 확정
- **`/` (root)**
  - 세션 없음 → `/onboarding` (이전에는 `/login` 으로 튕겼음). 차가운 트래픽이 처음 보는 것은 **signup-first** 화면.
  - 세션 있음 → 기존대로 `routeByAuthState(..., { sessionPresent: true })`.
- **`/onboarding`**
  - 여전히 이메일 + 비밀번호 + 확인 3필드. CTA 를 "바로 시작하기" / "Get started" 톤으로 조정.
  - H1: "Abstract 바로 시작하기" / "Get started with Abstract". 기능 문구는 차분하게 유지 (브랜딩 패스 아님).
  - 푸터 "이미 계정이 있으신가요? 로그인" 링크는 그대로 — returning user 를 `/login` 으로 안내.
- **`/login` (완전 재작성)**
  - Login-first 로 축소. 상단에 차분한 "돌아오신 것을 환영해요" 헤더, 이메일/비밀번호 1 form.
  - **비밀번호 없이 로그인** 은 disclosure 버튼 뒤로 접힘 (기본 상태: 닫힘). 펼치면 회색 박스 안에 작은 이메일 입력 + "로그인 링크 보내기" 버튼. 메인 폼과 시각적 무게가 경쟁하지 않음.
  - "매직링크" / "magic link" 용어는 사용자 표시 문자열에서 전부 제거 (Track F). 대체 용어: "비밀번호 없이 로그인", "이메일로 일회용 로그인 링크", "로그인 링크 보내기".
  - 하단에 크게 노출되는 "Abstract가 처음이신가요? **바로 시작하기**" 링크 → `/onboarding`. next 파라미터는 보존.

### 2. 매직링크 정책
- **허용**: `/login` 내부의 disclosure 뒤 보조 옵션 / invite / auth callback / 내부 도구.
- **금지**: 공개 첫 화면에 password 로그인과 같은 무게로 노출되는 폼; "매직링크" 용어; 신규 유저가 비밀번호 설정을 건너뛰게 만드는 기본 경로.

### 3. i18n 변경
EN+KO:
- 제거: `login.useEmailLink`, `login.magicLinkPlaceholder`, `login.sendMagicLink`, `login.checkEmail`.
- 추가: `login.welcomeBack`, `login.startSignup`, `login.passwordlessOpen`, `login.passwordlessClose`, `login.passwordlessHint`, `login.passwordlessSend`, `login.passwordlessSent`, `login.passwordlessRateLimit`, `login.noAccount` (문구 조정: "New to Abstract?" / "Abstract가 처음이신가요?").
- 조정: `onboarding.createAccount` → "Abstract 바로 시작하기" / "Get started with Abstract", `onboarding.createAccountButton` → "바로 시작하기" / "Get started", `onboarding.creatingAccount` → "계정을 만드는 중..." / "Getting started...".
- KO messages.ts 전수 스캔으로 "매직" 문자열이 사용자 표시 값에서 0건임을 스모크가 강제.

### 4. Runtime smoke 확장 (`tests/onboarding-smoke.mjs`)
이미 있는 invariant 1~5 유지. 신규 invariant 6 추가:

- **6a**: `src/app/page.tsx` 의 no-session 분기는 `ONBOARDING_PATH` 로만 리다이렉트한다. `LOGIN_PATH` 로 바꾸면 실패.
- **6b**: `/login` 은 `login.magicLinkPlaceholder` / `login.sendMagicLink` 키를 호출하면 안 되고, passwordless form 은 반드시 `passwordlessOpen` state 뒤에 gated 되어 있어야 하며, `/onboarding` 링크를 노출해야 함.
- **6c**: `src/lib/i18n/messages.ts` 의 사용자 표시 값 어디에도 "매직" 또는 "magic link" 가 없어야 함.

실행: `npm run test:onboarding-smoke`.

### 5. 검증
- `npx tsc --noEmit` pass.
- `npx eslint src/app/page.tsx src/app/login src/app/onboarding tests/onboarding-smoke.mjs src/lib/i18n/messages.ts` clean.
- `node tests/ai-safety.mjs` pass.
- `node tests/onboarding-smoke.mjs` pass (invariants 1~6 포함).

### 6. 수동 QA 매트릭스
1. 로그아웃 상태에서 루트 `/` 접속: `/onboarding` 으로 리다이렉트. 로그인 화면을 먼저 마주치지 않음.
2. `/onboarding` CTA 클릭 → 가입 성공 → `/onboarding/identity` 로 연결.
3. `/login` 직접 접속: 이메일/비밀번호 폼이 지배적이고, "비밀번호 없이 로그인" 은 접혀 있음. 펼쳐도 시각 무게는 보조.
4. `/login` 에서 "바로 시작하기" 링크 클릭 → `/onboarding` (next 보존 포함).
5. `/login?next=/artwork/xxx`: 로그인 성공 후 `/artwork/xxx` 로 복귀, passwordless 열어도 next 보존.
6. 초대 링크(`/invites/delegation?token=abc`)에서 "Sign up" → `/onboarding?next=/invites/delegation?token=abc` → 가입 후 identity 완료하면 초대 페이지로 복귀.
7. Placeholder 계정으로 로그인: Header "My Profile" 이 여전히 `/onboarding/identity` 로 보내는지.
8. 전체 소스와 i18n 값에서 "매직" 문자열 grep: 0건.

---

## 2026-04-19 — Onboarding Smoothness Follow-up Patch

브랜치: 현재 작업 브랜치.

### 0. 한 줄 요약

> "가입은 이메일·비밀번호만으로 가볍게. 모든 공개 identity 는 `/onboarding/identity` 한 곳에서. 모든 signup flavor(password / magic-link / invite)는 동일한 identity gate 로 수렴."

### 1. Front door 리셰이프
- `/onboarding`: 신규 유저 가입 전용 surface 로 축소. 수집 항목은 `email` + `password` + `password confirmation` 뿐. 역할/사용자명/표시 이름/공개 범위는 모두 제거.
  - `signUpWithPassword(email, password)` 를 metadata 없이 호출 → 백엔드 trigger 가 minimal profile row 를 만들 때 placeholder 로 들어와도 gate 가 `/onboarding/identity` 로 회수한다.
  - 세션이 있는 방문자는 `routeByAuthState(..., { sessionPresent: true })` 로 즉시 재라우팅 되어 이 페이지가 보이지 않음.
- `/onboarding/identity`: 2단계 identity-finish surface 로 톤다운 개선.
  - "Step 2 of 2" eyebrow + 섹션 3개 (`You` / `Role` / `Visibility`) 분리. 첫 역할 선택 시 primary 가 자동 지정되어 "역할을 골랐는데 primary 가 비어있음" 혼란 제거.
  - sticky primary CTA ("Continue to Abstract") + 차분한 one-time setup 카피.
  - 여전히 live username availability, 추천, preview, destination restore, public/private, role 선택 유지.
- `src/lib/i18n/messages.ts`: 폐기된 signup-시절 키 (labelUsername/labelRoles/privacyTitle/…) 모두 제거, 새 키 (`onboarding.stepEyebrow`, `onboarding.passwordHint`, `onboarding.nextStepHint`, `identity.finish.stepEyebrow`, `identity.finish.section*`, `identity.finish.displayNameHint`, `identity.finish.rolesHint`) 추가.

### 2. 하나의 identity gate
- 모든 entry (`/`, `/login`, `/auth/callback`, `/onboarding`, `/onboarding/identity`) 에서 `routeByAuthState(...)` 호출 시 세션이 이미 확인된 경우 **반드시** `sessionPresent: true` 를 넘긴다. 이 규칙을 `tests/onboarding-smoke.mjs` 의 invariant 3 이 강제한다.
- AuthGate: 세션이 있는데 `get_my_auth_state()` 가 null 을 반환한 경우 `/login` 으로 튕기지 않고 페이지를 그대로 렌더(이미 Identity Overhaul 에서 적용, 재확인).
- Header "My Profile": placeholder username 이거나 profile 이 없으면 `/onboarding/identity` 로 (Identity Overhaul 유지).
- `/invites/delegation` 의 "Sign up" 링크는 `next` 를 항상 보존해서 초대 가입도 identity-finish 를 거쳐 초대 페이지로 다시 돌아온다.

### 3. Runtime smoke (`tests/onboarding-smoke.mjs`)
정적 grep 수준의 회귀 테스트지만 "대문이 다시 무거워지거나 session-present 가 빠진 commit" 을 즉시 차단한다.

1. `/onboarding` 에 `setUsername` / `setDisplayName` / `setMainRole` / `checkUsernameAvailability` / `saveProfileUnified` / 구 i18n 라벨이 다시 들어오면 실패.
2. `checkUsernameAvailability` / `check_username_availability` 는 identity-finish page + `UsernameField` + RPC wrapper + suggestion 로직에서만 허용. 그 외 파일에서 호출하면 실패.
3. 주요 entry 5개 파일 모두 `routeByAuthState(...)` 를 호출해야 하고, 그 호출 인자에 `sessionPresent: true` 가 있어야 함.
4. Header 는 `isPlaceholderUsername(...)` 을 여전히 호출하며 `/onboarding/identity` 로 링크해야 함.
5. `/invites/delegation` 는 `/onboarding?next=` 형태로 링크해야 함.

실행: `npm run test:onboarding-smoke`.

### 4. 검증
- `npx tsc --noEmit` pass.
- `npx eslint src/app/onboarding src/components/ds src/components/onboarding src/lib/identity` clean.
- `node tests/ai-safety.mjs` pass.
- `node tests/onboarding-smoke.mjs` pass.

### 5. 수동 QA 매트릭스
1. 비회원 → `/onboarding`: 이메일/비밀번호 3개 필드만 보이는지.
2. 비회원 → `/onboarding?next=/invites/delegation?token=abc`: 가입 성공 후 `/onboarding/identity?next=...` 로 넘어가고, identity 완성 뒤 delegation 페이지로 복귀하는지.
3. 매직링크 로그인 → placeholder 상태로 복귀: `/auth/callback` 이 `/onboarding/identity` 로 보내는지.
4. 정상 계정 로그인: `/onboarding/identity` 를 건너뛰고 destination 으로 바로 이동하는지.
5. Placeholder 계정으로 Header "My Profile" 클릭: `/onboarding/identity` 로 이동하는지.
6. Identity 완성 후 section 3개가 모두 정렬되어 보이고, 역할 첫 선택이 자동으로 primary 가 되는지.

---

## 2026-04-19 — Onboarding Identity Overhaul Patch

브랜치: 현재 작업 브랜치.

### 0. 한 줄 요약

> "로그인 ≠ 신원 완성. 플레이스홀더 유저는 절대 공개 surface 에 정상처럼 보이면 안 된다. Identity 완성 여부는 `get_my_auth_state()` 한 곳에서 결정되고, 모든 entry 가 동일한 `routeByAuthState` gate 로 수렴된다."

### 1. Identity SSOT (DB)

- `supabase/migrations/20260421120000_identity_completeness.sql`
  - `public.is_placeholder_username(text)` — `^user_[a-f0-9]{6,16}$` 정규식을 DB 공용 헬퍼로 고정.
  - `public.get_my_auth_state()` 확장(additive): `display_name`, `is_placeholder_username`, `needs_identity_setup` 추가. `needs_identity_setup` 은 (a) 프로필 미존재, (b) username 이 placeholder, (c) display_name 빈값, (d) roles 누락, (e) main_role 누락 중 하나라도 해당되면 true.
  - `public.check_username_availability(text)` 신규 RPC — reason: `ok` / `invalid` / `reserved` / `placeholder` / `taken` / `self`.
  - `public.ops_onboarding_summary()` — placeholder 판정을 새 헬퍼로 교체.
  - `public.v_identity_rescue_stats` (security_invoker) — 오퍼레이터용 placeholder/rescue 카운트.

### 2. Routing Gate 수렴

- `src/lib/identity/routing.ts` — `routeByAuthState(state, { nextPath })` 가 **유일한** 경로 결정 함수. 우선순위: `needs_identity_setup` → `/onboarding/identity` → `needs_onboarding` → `/onboarding` → `!has_password` → `/set-password` → `next`.
- `src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/auth/callback/page.tsx`, `src/components/AuthGate.tsx`, `src/app/onboarding/page.tsx` 전부 이 헬퍼로 통일. AuthGate 는 gap 이 실제로 있을 때만 `router.replace` (루프 방지).
- `src/components/ProfileBootstrap.tsx` — `/onboarding`, `/onboarding/identity`, `/username-fix`, `/set-password`, `/auth/*` 에서는 `ensure_my_profile` 호출 skip (placeholder 재생산 차단).

### 3. Identity-finish 전용 페이지

- `src/app/onboarding/identity/page.tsx` — 단일 surface. display_name → UsernameField → main_role → roles → public/private → 저장. 저장 후 `routeByAuthState` 로 복귀.
- `src/components/onboarding/UsernameField.tsx` — debounce 300ms `check_username_availability` RPC, 제안 chip tap-to-fill.
- `src/components/onboarding/IdentityPreview.tsx` — 실시간 미니 프로필 헤더. placeholder 인 동안엔 `@handle` 대신 중립 라벨.
- `src/lib/identity/suggestions.ts` — display_name/email 에서 후보 생성 → RPC 로 availability 확인.
- `src/app/username-fix/page.tsx` — legacy shim. `sessionStorage` 잔재 정리 후 `/onboarding/identity?next=...` 로 replace.
- `src/app/onboarding/page.tsx` — 로그인된 placeholder 유저가 들어오면 즉시 `routeByAuthState` 로 위임(이전의 "profile 모드"는 제거).

### 4. Public surface 억제

- `src/lib/identity/placeholder.ts` — 클라이언트 canonical regex. `src/lib/profile/randomUsername.ts` 는 deprecated alias.
- `src/lib/identity/format.ts`
  - `formatUsername(profile)` → placeholder 면 `null`.
  - `formatDisplayName(profile, t?)` → display_name 없고 placeholder 면 `identity.incompletePlaceholder`.
  - `formatIdentityPair(profile, t?)` → 같은 기준, primary 는 중립 라벨, secondary 는 빈값.
  - `hasPublicLinkableUsername(profile)` → placeholder 가 아닐 때만 true. 공개 링크 보호용.
- 소비자 업데이트: `FeedArtworkCard`, `ArtworkCard`, `FeedDiscoveryBlock`, `PeopleClient` (placeholder 자체를 리스트에서 제외), `UserProfileContent`, `my/inquiries`.
- `src/components/RandomIdBanner.tsx` — CTA 를 `/onboarding/identity` 로 변경, i18n 키(`banner.identityFinish.*`) 사용.
- `src/components/Header.tsx` — `myHref` 가 placeholder 이면 `/onboarding/identity`, 아바타 fallback 글자도 `user_...` 대신 `?` 로 마스킹.

### 5. Invite / login smoothing

- `src/app/invites/delegation/page.tsx` — 미로그인 상태 signup 버튼이 `/onboarding?next=/invites/delegation?token=...` 으로 `next` 보존.
- `src/app/api/delegation-invite-email/route.ts` — base URL 검증 강화: vercel.com 거부에 더해 non-https 거부(localhost 예외), 경로 정규화.
- `src/app/login/page.tsx` — password 로그인 경로도 `routeByAuthState` 로 수렴(placeholder 유저는 자동으로 identity-finish 로 라우팅).

### 6. Ops

- `src/app/my/ops/page.tsx` — 라벨 "Random ID" → "Placeholder ID", legacy "Username fix" 버튼은 `/onboarding/identity` 복사로 교체. 상단에 `v_identity_rescue_stats` 4-칸 요약 섹션(Still placeholder / New placeholder 7d·30d / Rescued 7d / Rescued 30d).

### 7. i18n

- `src/lib/i18n/messages.ts` 확장: `identity.finish.*`, `identity.username.live.*`, `identity.username.suggestions.*`, `identity.preview.*`, `identity.incompletePlaceholder`, `banner.identityFinish.*` (en/ko).

### 8. 검증

- `npx tsc --noEmit` pass.
- `npm run lint` pass.
- QA 매트릭스: (a) 신규 이메일+비밀번호 가입 (b) magic-link 가입 (c) 기존 비밀번호 유저 (d) 위임 초대 수락 (e) placeholder 유저가 `/feed` 접근 → gate 가 `/onboarding/identity` 로 라우팅 (f) identity-complete 유저 → 기존 경로 유지 (g) 직접 `/username-fix` 진입 → 새 surface 로 redirect.

---

## 2026-04-19 — AI Wave 2 Actionful Studio Patch

브랜치: 현재 작업 브랜치.

### 0. 한 줄 요약

> "Wave 2는 AI preview 레이어를 '정말 쓰이는' Studio/워크플로우 레이어로 전환한다. 스키마 확장은 관측용 뷰(`v_ai_events_summary`)뿐이며, 신뢰 경계는 Wave 1을 유지한다."

### 1. Track 0 — Cleanup

- **0.A Confirm primitive**: `src/components/ds/ConfirmActionDialog.tsx` 신설 (focus trap, Esc/backdrop cancel, body scroll lock). `AiDraftPanel` replace, 작품 삭제, shortlist 파괴적 액션(토큰 회전·제거·컬래버레이터)을 전부 DS 모달로 이식. `window.confirm` 잔존 0건 (AI 경로).
- **0.B Acceptance SSOT**: `src/lib/ai/accept.ts` 의 `markAiAccepted(aiEventId, {feature, via})` 를 모든 소비자 경로가 사용. Inquiry는 **send-after-edit** 규칙 — apply/copy 시점이 아니라 `/api/messages/reply` 성공 직후에만 accepted 플립.
- **0.C Path drift**: `/api/ai/accept` 주석과 `src/lib/ai/browser.ts` 주석이 canonical helper 를 `src/lib/ai/accept.ts` 로 지칭.
- **0.D 4카드 표준화**: `src/components/studio/intelligence/aiCardState.ts` (`aiErrorKey`) 로 degradation → i18n 매핑 통일. Profile/Portfolio/Digest/Matchmaker 모두 idle/loading/degraded/empty/dismiss 상태를 같은 골격으로 렌더.

### 2. Track A–G — 기능 확장

| Track | 핵심 변경 |
|---|---|
| A. Profile Copilot | `bioDrafts`/`headlineDrafts`/`discoverabilityRationale` 확장. 프롬프트 `PROFILE_COPILOT_SYSTEM` 에 username/role/public 변경 금지 footer. 클라이언트 후처리에서도 해당 패턴 필터. |
| B. Portfolio Copilot | 제안을 kind (`reorder`/`feature`/`highlight`/`gap`)로 그룹, `artworkIds` 딥링크 칩, `ordering` 섹션은 "Copy checklist"로 제공. 개별 "Mark reviewed" 상태. |
| C. Exhibition Post Producer Lite | non-title draft 에 `ai.exhibition.previewOnly` 힌트. 직접 DB 업데이트 없음. |
| D. Inquiry Concierge v2 | `lengthPreference` (`short`/`medium`/`long`) 토글 + `tonePrefs` 보존. 프롬프트에 가격·소유권 조작 금지 footer. |
| E. Matchmaker | `suggestedAction` (`follow_back`/`intro_note`/`share_exhibition`/`save_for_later`) 와 `suggestedArtworkIds` 렌더. `intro_note` 는 `IntroMessageAssist` 를 인라인으로 오픈. `me.artworks` 컨텍스트 전달. |
| F. Weekly Studio Digest | `recentUploads` 컨텍스트, sparse-signal 규칙 시스템 프롬프트. |
| G. Action 어휘 | `ai.action.useAsBio`, `ai.action.useAsReply` 등 task-oriented 라벨. `AiDraftPanel.applyLabelKey` prop. |

### 3. Track H — 관측/베타 컨트롤

- 마이그레이션 `supabase/migrations/20260420120000_v_ai_events_summary.sql`: `v_ai_events_summary` (security_invoker) — feature 별 total/accepted/degraded, 7d 카운트, avg/p95 latency.
- `/dev/ai-metrics` (개발 환경 + `NEXT_PUBLIC_AI_METRICS=1`) 개발자 게이티드 페이지.
- `src/lib/ai/route.ts` 비-프로덕션에서 `console.debug` 로 prompt/response 크기 + latency 출력.

### 4. 검증

- `npx tsc --noEmit` pass.
- `node tests/ai-safety.mjs` pass. 신규 invariant:
  - #4 `src/components/ai/**` 에서 `window.confirm` 금지.
  - #5 `PROFILE_COPILOT_SYSTEM` 의 username/role/public 변경 금지 안내 및 `INQUIRY_REPLY_SYSTEM` 의 가격·소유권 조작 금지 안내 필수.
- `npm run lint` — 본 패치 범위 경고 0건 (기존 잔존 경고는 무관).

### 5. 데이터/운영 노트

- Supabase: `20260420120000_v_ai_events_summary.sql` 적용 필요. RLS 는 기저 `ai_events` 의 owner-only 정책을 그대로 상속.
- 신규 테이블/인덱스 없음. `ai_events` 의 기존 스키마(Wave 1) 재사용.

---

## 2026-04-19 — AI Wave 1 Hardening Patch

브랜치: 현재 작업 브랜치.

### 0. 한 줄 요약

> "Wave 1 AI 레이어를 신뢰 경계·로케일·텔레메트리·SSOT·액션 어휘·라우트 하드닝 축에서 마감한다. 신규 기능 없음."

### 1. 스코프 (7 트랙)

| 트랙 | 내용 |
|---|---|
| A. Trust-boundary | `MatchmakerCard` 포함 모든 AI surface에서 마운트 자동 생성 제거. `Generate draft`를 명시적 CTA로 통일. `tests/ai-safety.mjs` (npm `test:ai-safety`)로 (1) AI 컴포넌트 `useEffect` 내 `trigger/fetch/callAi` 금지, (2) `/api/ai/*` 라우트가 메시지/알림/팔로우 같은 외부 부작용을 갖지 않음, (3) 코드베이스 어디에도 `locale: "ko"` 하드코드가 없음을 정적으로 보장. |
| B. Locale correctness | `src/lib/i18n/useT.ts`의 `locale`을 모든 AI 컴포넌트/`StudioIntelligenceSurface`에 전달. 모든 `/api/ai/*` 요청 body에 실제 UI 로케일을 실어 보냄. 하드코드 `"ko"` 전량 제거. |
| C. Acceptance telemetry | `logAiEvent`가 `ai_events.id`를 반환. 새 라우트 `POST /api/ai/accept`가 owner-RLS로 `accepted=true` 플립. 마이그레이션 `20260419150000_ai_events_accepted.sql`이 `ai_events_update_own` UPDATE 정책 추가. 클라이언트 `acceptAiEvent`를 모든 apply/copy/link 경로에 연결. |
| D. Profile SSOT | `/my`, `StudioIntelligenceSurface`, `/people`에서 `profile_details` 직접 머지 중단. 모두 `getProfileSurface(profile)` 결과의 `ProfileSurface` 타입만 소비. |
| E. Action vocabulary | `AiDraftPanel`에 `ApplyMode = "insert" \| "append" \| "replace" \| "link"` 정식 도입. `"auto"`는 `currentValue` 유무로 insert ↔ replace 결정. replace는 `window.confirm`. `onDismiss` 제공. `ai.action.*` i18n 키 추가. |
| F. Route hardening | 신규 `src/lib/ai/validation.ts`로 8개 라우트마다 `parse*Body` 화이트리스트 검증 + 컨텍스트 크기 가드 (`LIMITS`). 검증 실패 시 400 `{degraded:true, reason:"invalid_input"}`. `handleAiRoute`는 성공·no_key·에러 어디서든 `aiEventId`를 일관되게 반환. |
| G. Wave 2 readiness | `src/lib/ai/tonePrefs.ts`가 `localStorage` 기반으로 서페이스별 마지막 톤을 기억 (`ai.tone.bio`, `ai.tone.inquiry`). `AiDraftPanel`의 인서션 포인트(`currentValue` + `onApply(mode)`)를 안정화하여 Wave 2 액션 연결 지점 고정. |

### 2. 핵심 파일

```
src/lib/ai/
  ├─ types.ts          (AiDegradation에 aiEventId, "invalid_input" reason, AiLocale)
  ├─ events.ts         (logAiEvent → Promise<string|null>, markAiEventAccepted 추가)
  ├─ validation.ts     (신규, 라우트 body 스키마 + LIMITS)
  ├─ route.ts          (validateBody 훅, degradedResponse 통일, aiEventId 응답)
  ├─ browser.ts        (acceptAiEvent, getAccessToken, 400/503 처리)
  └─ tonePrefs.ts      (신규, localStorage 톤 기억)

src/app/api/ai/accept/route.ts   (신규)
supabase/migrations/20260419150000_ai_events_accepted.sql  (신규)

src/components/ai/
  ├─ AiDraftPanel.tsx         (ApplyMode, Replace confirm, onDismiss)
  ├─ BioDraftAssist.tsx       (useState lazy + tonePrefs + acceptAiEvent)
  ├─ InquiryReplyAssist.tsx   (동일 + currentReply prop)
  ├─ ExhibitionDraftAssist.tsx, IntroMessageAssist.tsx

src/components/studio/
  ├─ StudioIntelligenceSurface.tsx  (ProfileSurface prop, locale 플럼빙)
  └─ intelligence/{Profile,Portfolio,WeeklyDigest,Matchmaker}Card.tsx

src/app/my/page.tsx, src/app/people/PeopleClient.tsx (getProfileSurface 통일)

tests/ai-safety.mjs  (신규)
```

### 3. RLS / DB 변경

`ai_events_update_own` (owner UPDATE). 라우트는 `accepted` 외 컬럼을 쓰지 않는다 (API 레이어에서 보장, RLS는 소유권만 보장).

### 4. 검증

- `npx tsc --noEmit` — 통과.
- `npm run test:ai-safety` — AI safety: all invariants hold.
- `supabase db push` — 신규 마이그레이션 적용 완료.
- 수동 QA (EN/KO, 8개 라우트, Studio 초기 진입 자동 생성 없음, apply 시 `ai_events.accepted=true` 확인) 는 `docs/QA_MEGA_UPGRADE.md`의 Wave 1 체크리스트를 재사용.

### 5. 리스크 / 노트

- `acceptAiEvent`는 best-effort. 네트워크 실패 시 사용자 흐름을 막지 않음. 집계상 `accepted_events / total_events` 가 아주 약간 과소계수될 수 있음.
- `tonePrefs`는 오직 로컬. 계정 연동 아님.
- `validation.LIMITS` 값(예: 포트폴리오 24작품, 바이오 8,000자)은 토큰 비용 기준 초기 추정치. `ai_events.context_size` 분포를 본 뒤 조정.

---

## 2026-04-19 — AI-Native Studio Layer (Wave 1)

브랜치: 현재 작업 브랜치.

### 0. 한 줄 요약

> "`/my` Studio에 AI 초안 보조 레이어를 얹는다. 결과물은 모두 편집 가능한 미리보기이며, 신뢰 경계 자동 판정은 하지 않는다."

### 1. 스코프

| 트랙 | 내용 |
|---|---|
| 인프라 (Track 0) | `openai` 패키지 추가, `ai_events` 테이블 + RLS (`20260419120000_ai_events.sql`), 환경 변수 문서화 (`.env.example`에 `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_USER_DAILY_SOFT_CAP`). |
| AI 코어 (Track D) | `src/lib/ai/{client,safety,events,softCap,prompts,contexts,route,browser,types}` + 8개 route handler (`/api/ai/*`). Bearer JWT + RLS 기반 서버 슈파베이스 클라이언트. 8초 timeout, 1회 재시도, 파싱 실패 시 `degraded: true`. |
| Studio Intelligence (Track A) | `StudioIntelligenceSurface`가 4카드 (`ProfileCopilotCard`, `PortfolioCopilotCard`, `WeeklyDigestCard`, `MatchmakerCard`)를 렌더. `actingAsProfileId`일 때는 노출하지 않음. |
| Workflow assist (Track B) | `BioDraftAssist` (settings), `ExhibitionDraftAssist` (new / edit 전시), `InquiryReplyAssist` (`/my/inquiries`, `/artwork/[id]` 작가 블록). 전시 초안은 저장하지 않으며 제목만 채택 가능. 답장은 textarea에 삽입 후 사람이 전송. |
| Matchmaker Lite (Track C) | Studio Matchmaker 카드 + `/people` 카드의 `연결 메시지 초안` 버튼 (`IntroMessageAssist`). 자동 전송 없음. |
| UX 카피 (Track E) | `ai.*` i18n 네임스페이스 신규 (EN/KO). 사용자 surface에 "AI" 단어 미사용 (`ai.disclosure.tooltip`만 예외). |
| 관측/비용 (Track F) | `ai_events` insert (feature, context_size, latency_ms, model, error_code). `checkDailySoftCap` (기본 30 req/user/day, `AI_USER_DAILY_SOFT_CAP`으로 조정 가능). 클라이언트 채택 시 `logBetaEvent("ai_accepted", {...})`. |
| 문서 (Track G) | `docs/DESIGN.md` 섹션 1.4 (Trust boundary), 1.5 (Studio intelligence hierarchy), 1.6 (AI assist CTAs in workflows). `docs/QA_MEGA_UPGRADE.md`에 수동 QA 체크리스트. |

### 2. 명시적 연기 / 비범위

- 전시 description / wall text / invite blurb **DB 저장**은 이번 웨이브 범위 밖 (`projects` 테이블에 컬럼 없음). 현재는 복사 / 편집 전용.
- 포트폴리오 자동 재정렬 저장, press kit PDF 생성, 자동 outreach 발송, multi-agent UI는 모두 이번 웨이브 범위 밖.
- Claim 승인 / provenance 확정 / identity merge 자동화는 영구 금지 (safety.ts).

### 3. 환경 변수

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini         # 선택
AI_USER_DAILY_SOFT_CAP=30        # 선택
```

`OPENAI_API_KEY` 미설정 시 모든 AI route는 503 + `{degraded:true, reason:"no_key"}` 반환, UI는 조용히 fallback 문구만 표시.

### 4. 리스크

- Supabase 세션 쿠키가 아닌 `Authorization: Bearer <access_token>` 패턴이 새 약속. `src/lib/ai/browser.ts`의 `callAi` 한 곳에만 존재.
- OpenAI JSON 이탈 시 `stripCodeFence` + 마지막 `{...}` 파싱 fallback. 그래도 실패면 `degraded: true`.
- Soft cap 값(30)은 초기 추정치 — `ai_events` 로그 본 뒤 조정.

---

## 2026-04-18 — Abstract Next Mega Upgrade (Studio Slim-down + Design Spine + Reco Contract)

브랜치: 현재 작업 브랜치.

### 0. 한 줄 요약

> "`/my`를 진짜 Studio 셸로 얇게, 공용 UI 골격을 제자리에, 신원·추천 계약은 하나로."

### 1. 무엇이 달라졌나 (Before / After)

| 축 | Before | After |
|---|---|---|
| `/my` 페이지 | 1,000+ 라인, 헤더/CTA/KPI/포트폴리오 중복 블록 | 395 라인 오케스트레이터. 대형 블록은 `StudioQuickActions` / `StudioViewsInsights` / `StudioPortfolioPanel` / `StudioIntelligenceSurface`로 분리 |
| 디자인 골격 | 페이지마다 `rounded-lg border` 아드혹 카드·빈 상태 | `src/components/ds/*` 공유 프리미티브 (`SectionFrame`, `SectionTitle`, `EmptyState`, `Chip`)를 `/my`, `/people`, `/u`, `/e`, `/artwork`, `/notifications`, `/my/inquiries`에 적용 |
| 신원 표기 | 업로드/전시/편집 폼에서 `p.display_name \|\| p.username \|\| p.id` 아드혹 표현 | 전 플로우에서 `formatIdentityPair` / `formatDisplayName` / `formatUsername` 경유 |
| People 추천 | `getPeopleRecs` + `searchPeopleWithArtwork` 두 계약을 혼용 | `getPeopleRecommendations` 단일 계약 (+ `searchVariant: "merged" \| "name_only"`); `PeopleClient`, `FeedContent` 모두 이 계약만 호출 |
| AI 삽입점 | 구조 없음 | `StudioIntelligenceSurface` 빈 컨테이너만 배치 (가짜 AI 문구 금지, `aria-hidden` 장식 슬롯) |

### 2. 새/갱신된 표면

```
src/components/ds/
  ├─ SectionFrame.tsx   (rounded-2xl / tone / padding)
  ├─ SectionTitle.tsx   (eyebrow + heading + action)
  ├─ EmptyState.tsx     (title / desc / primary·secondary action)
  └─ Chip.tsx           (neutral/accent/warning/success/muted)

src/components/studio/
  ├─ StudioQuickActions.tsx     (Next Actions 보조 CTA 한 줄)
  ├─ StudioViewsInsights.tsx    (7일 profile views + 최근 viewer 3, settings 딥링크)
  ├─ StudioPortfolioPanel.tsx   (persona tabs, 재정렬, bulk delete)
  └─ StudioIntelligenceSurface.tsx (AI 삽입용 정적 컨테이너)

src/lib/supabase/recommendations.ts — getPeopleRecommendations + searchVariant
```

### 3. 정책 (SSOT 보강)

- `/my` 및 프로필 기반 모든 surface는 카드·빈 상태·칩을 `src/components/ds/*`에서 가져온다. 페이지 레벨에서 `rounded-lg border …` 카드 shell을 재선언하지 않는다.
- 사람 이름·핸들은 항상 `formatIdentityPair` / `formatDisplayName` / `formatUsername`를 통과한다. 검색 드롭다운·`Selected` 라벨·전시 칩도 예외가 아니다.
- People 추천·검색은 `getPeopleRecommendations` 하나만 호출한다. `getPeopleRecs` / `searchPeopleWithArtwork`는 내부 구현 디테일이며 UI 경로에서 직접 사용하지 않는다.
- AI 기능이 준비되기 전까지 `StudioIntelligenceSurface`는 문구 없는 구조적 슬롯으로만 존재한다. "곧 제공" 같은 약속 카피를 추가하지 않는다.

### 4. 리스크 / 의도적 연기

- `StudioPortfolioPanel` 안에 아직 legacy persona 탭/삭제 UX가 그대로 유지됨. 탭 레일과 카드 그리드를 더 얇게 만드는 작업은 후속 UI 패스에서 진행.
- `StudioIntelligenceSurface`는 구조만 제공하고 실제 AI 컨텐츠는 후속 AI 패치로 연기. 이 패치에서는 텍스트·가짜 데이터 금지 원칙을 유지.
- `/settings` 인사이트 패널은 기존 구현을 유지하며, `StudioViewsInsights`는 딥링크만 제공. 본격 인사이트 이동은 별도 과제.

## 2026-04-18 — Abstract Mega Upgrade (Identity + Trust + Profile-first UX + Proactive Portfolio)

브랜치: `feature/abstract-mega-upgrade-profile-first`

### 0. 한 줄 요약

> "기본을 견고하게, 프로필을 중심으로, 의사 결정을 1개씩."

### 1. Before / After

| 축 | Before | After |
|---|---|---|
| Auth 상태 | `localStorage.HAS_PASSWORD_KEY`에 의존 (비권위적) | `public.get_my_auth_state()` RPC를 호출부 7곳에서 사용 |
| Storage RLS | `artworks` bucket에 public delete 정책 존재 | `can_manage_artworks_storage_path()` 함수로 소유자/프로젝트 멤버만 관리 |
| Profiles RLS | `profiles_select_self USING(true)` 등 과도 허용 | `profiles_read_public_or_self` 1개로 축약, private 차단 |
| Shortlists/Projects RLS | self-join 오타로 권한 평가 불가 | `EXISTS (... sc.profile_id = auth.uid())`로 재작성 |
| 정체성 렌더 | ad-hoc `profile.display_name` | `src/lib/identity/format.ts` SSOT 경유 |
| Role 라벨 | 하드코딩 문자열 | `roleLabel(key, t)` + i18n 키 (artist/curator/collector/gallerist) |
| 추천 이유 | `follow_graph` 태그를 그대로 노출 | `reasonTagToI18n` 사용자 문장 |
| Recommendation API | RPC 2개 직접 호출 | `getPeopleRecommendations` 단일 contract |
| Provenance 라벨 | `CURATED`, `EXHIBITED` raw | `provenanceLabel()` + `label.*` i18n |
| 아트워크 상세 | 정보가 평면 나열 | 작품→작가(역할칩+팔로우)→provenance→전시→가격→related |
| /my | 921 라인 단일 페이지 | `StudioHero` + `StudioSignals` + `StudioNextActions` + `StudioSectionNav` 상단 + 기존 상세 유지 |
| Acting-as | 페이지마다 별도 UI | 글로벌 `ActingAsBanner` |
| 온보딩 | 검증 실패 메시지만 | `@handle` 실시간 availability, public/private 토글, role chip, 프리뷰 카드 |
| Debug 페이지 | dev 분기만 | middleware에서 production 접근 차단 |

### 2. 기능 지도 (새 표면)

```
/my
  └─ StudioHero         (src/components/studio/StudioHero.tsx)
  └─ StudioSignals      (7일 views/followers/inquiries/claims)
  └─ StudioNextActions  (src/lib/studio/priority.ts 가 우선순위 계산)
  └─ StudioSectionNav   (Portfolio / Exhibitions / Inbox / Network / Operations)
/onboarding             (live @handle check + privacy toggle + preview)
/my/claims              (trust workflow copy + pending badge)
/my/delegations         (stage chips: Invitation / Acting as / Closed)
<ActingAsBanner/>       (layout 최상단, 계정 위임 상태 상시 표시)

src/lib/identity/format.ts          — display_name/@handle/role pair SSOT
src/lib/identity/roles.ts           — RoleKey + roleLabel + hasAnyRole
src/lib/people/reason.ts            — 추천 이유 사람 언어화
src/lib/supabase/recommendations.ts — getPeopleRecommendations 단일 contract
src/lib/provenance/label.ts         — claim_type → user-facing label
src/lib/profile/surface.ts          — getProfileSurface: profile_details 격하
src/lib/studio/priority.ts          — Next Actions 우선순위 엔진
```

### 3. 정책 (SSOT)

- DB 인증 상태는 `get_my_auth_state()` 하나가 결정한다. 클라이언트는 판단하지 않는다.
- `storage.objects` 정책은 `artworks`에 대해서만 `can_manage_artworks_storage_path` 경유로 허용한다. 공개 delete는 절대 존재하지 않는다.
- UI에서 `profile.display_name` / `profile_details` 직접 참조 금지. 모든 접근은 `formatIdentityPair`, `formatRoleChips`, `getProfileSurface`를 통과한다.
- provenance/role/reason의 표시는 항상 i18n 키를 거친다.

### 4. 테스트

- `supabase/tests/p0_rls_matrix.sql` — storage/profiles/shortlists/projects/auth-state smoke matrix.
- `e2e/auth-gate.spec.ts` — anon 사용자가 `/my`, `/onboarding`, `/set-password`에서 올바르게 redirect 되는지 검증.
- 기존 `e2e/smoke.spec.ts` 회귀.

### 5. 리스크

- /my 페이지는 신규 Studio 블록과 기존 컴포넌트가 공존한다. 후속 PR에서 하단 상세 섹션을 `StudioSectionNav` 기준으로 /my/\* 로 이전해야 최종 단순화가 완료된다.
- `profile_details` 컬럼은 RLS 축약만 수행했고 삭제하지 않았다. 다음 패치에서 컬럼을 제거하기 전에 기록 작성 코드 경로를 점검해야 한다.

## 2026-03-30 — "Basics Are Solid" Patch

기능 추가 없이 기본기를 복원하는 올인원 패치. "이 플랫폼은 살아있고 기본이 탄탄하다"를 우선함.

### 변경 요약

- **Scope A — Feed 복원**: `loadMore` 시 중복 방지 (`deduplicateAndSort` 헬퍼), 양 탭(All/Following) 모두 IntersectionObserver 무한 스크롤, 끝 상태("You're all caught up") 표시, 불필요한 가드 제거.
- **Scope B — Artist attribution SSOT**: `getArtworkArtistLabel()` SSOT resolver. 전시 페이지 그룹핑을 복합 키(`artist_id || ext:label`)로 변경. 외부(미가입) 아티스트 이름이 빈 버킷으로 빠지지 않음.
- **Scope C — Size truth 경화**:
  - `parseSizeWithUnit()` 수정: inch/cm 접미사가 **명시적으로 존재**할 때만 해당 단위로 인식. `100 x 80` (접미사 없음) → `unit: null` (unitless).
  - `formatSizeForLocale()` 수정: `sizeUnit === null`일 때 원본 수치 보존, cm→in 변환 하지 않음.
  - `parseSize()` 수정: inch regex에서 explicit suffix 요구.
- **Scope D — Price truth 경화**:
  - `getArtworkPriceDisplay()` 공유 유틸 추가 (`artworks.ts`). 입력 통화를 우선 표시: `₩3,000,000 KRW (≈ $2,250 USD)`. USD 입력은 단순 표시.
  - i18n 키 추가: `artwork.priceUponRequest`, `artwork.priceHidden`, `artwork.priceApprox`.
  - `ArtworkCard`, `FeedArtworkCard`, `artwork/[id]` 3곳의 hardcoded `getPriceDisplay` → 공유 유틸로 교체.
- **Scope E — Import 정직성**:
  - SUPPORTED_COLUMNS 15개 → 7개로 축소 (title, year, medium, size, size_unit, ownership_status, pricing_mode). 실제 `updateArtwork`가 persist하는 필드만 표시.
  - description, price, currency, is_price_public, artist_name, artist_username, tags 제거 (persist 안 됨).
  - 템플릿, 요약, copy는 정직한 계약만 반영.
- **Scope F — 표면 간소화**: Save 모달 "Save" 제목, Alerts de-emphasis, Ops 내부전용, Room 헤더 간소화 (이전 패치).

### 수정 파일

| 파일 | 변경 |
|---|---|
| `src/lib/size/format.ts` | `parseSizeWithUnit` unitless 수정, `formatSizeForLocale` null unit 보존, `parseSize` inch regex 수정 |
| `src/lib/supabase/artworks.ts` | `getArtworkPriceDisplay()` 추가 |
| `src/lib/i18n/messages.ts` | price i18n 키 3개 추가 (en/ko) |
| `src/components/ArtworkCard.tsx` | hardcoded `getPriceDisplay` → `getArtworkPriceDisplay` |
| `src/components/FeedArtworkCard.tsx` | 동일 |
| `src/app/artwork/[id]/page.tsx` | 동일 |
| `src/app/my/library/import/page.tsx` | SUPPORTED_COLUMNS 축소, dead persist 코드 제거 |
| `src/components/FeedContent.tsx` | dedup, 끝 상태, IO 통일 |
| `src/app/e/[id]/page.tsx` | artist SSOT 적용 |
| `src/app/my/exhibitions/[id]/page.tsx` | artist SSOT 적용 |
| `src/components/SaveToShortlistModal.tsx` | copy 간소화 |
| `src/app/my/shortlists/[id]/page.tsx` | share controls 간소화 |
| `src/app/room/[token]/page.tsx` | 헤더 간소화 |
| `src/app/my/alerts/page.tsx` | digest de-emphasize |
| `src/app/my/ops/page.tsx` | "(internal)" 표시 |
| `src/app/my/page.tsx` | Ops 링크 제거 |
| `docs/HANDOFF.md` | 이 섹션 |
| `docs/QA_SMOKE.md` | 체크 업데이트 |

**Supabase SQL:** 돌려야 할 것 없음.

**환경 변수:** 변경 없음.

### Artist attribution SSOT (product truth)

`getArtworkArtistLabel(artwork)` — `src/lib/supabase/artworks.ts`

우선순위:
1. `claims → external_artists.display_name` (초대된 미가입 아티스트)
2. `profiles.display_name` (가입된 아티스트)
3. `@profiles.username`
4. fallback: `null` → UI에서 `t("artwork.artistFallback")` 표시

모든 작품 아티스트 이름 표시에 이 함수만 사용해야 함.

### Feed 동작 (product truth)

- **All / Following 모두**: IntersectionObserver (rootMargin 400px) 기반 무한 스크롤
- **Dedup**: merge 시 artwork ID / exhibition ID 기준 중복 제거
- **끝 상태**: cursor가 null → "You're all caught up" 텍스트 표시
- **Refresh**: 수동 refresh 버튼 + visibility/focus TTL refresh (90초)
- **No scroll fallback**: IntersectionObserver만 사용

### Size truth (product truth)

`parseSizeWithUnit(size)` — `src/lib/size/format.ts`

- `"20 x 30 in"` → unit: "in", widthCm: 50.8, heightCm: 76.2
- `"50 x 40 cm"` → unit: "cm", widthCm: 50, heightCm: 40
- `"30F"` → unit: "cm", 호수 기반 cm
- `"100 x 80"` → unit: null (unitless), widthCm: 100, heightCm: 80

`formatSizeForLocale(size, locale, sizeUnit)`:
- `sizeUnit === "in"`: EN에서 inch 그대로, KO에서 cm 변환
- `sizeUnit === "cm"`: KO에서 cm 그대로, EN에서 inch 변환
- `sizeUnit === null`: 원본 수치 보존, 단위 변환 없음

### Price truth (product truth)

`getArtworkPriceDisplay(artwork, t)` — `src/lib/supabase/artworks.ts`

- `pricing_mode === "inquire"` → i18n `artwork.priceUponRequest`
- `is_price_public === false` → i18n `artwork.priceHidden`
- 입력 통화 존재 시: `₩3,000,000 KRW (≈ $2,250 USD)` — 입력 통화 우선, FX 메타 있을 때만 USD 근사
- USD 입력: `$2,250 USD` 단순 표시
- 입력 통화 없으면 `$X USD` fallback

### Import contract (product truth)

**실제 persist 되는 필드만 지원:** title (필수), year, medium, size, size_unit, ownership_status, pricing_mode

**미지원 (일부러 제거):** description, visibility, price, currency, is_price_public, artist_name, artist_username, tags — `updateArtwork` payload에 없거나 DB 컬럼 불일치.

### Internal routes

| 경로 | 대상 | 접근 |
|---|---|---|
| `/my/ops` | 운영팀 | URL 직접 접근만 (대시보드에 미노출) |

### Acceptance checks

1. 메인 피드 하단에서 추가 콘텐츠 안정적 로딩
2. 중복 반복 카드 없음
3. `/e/[id]` 외부 아티스트 이름 정확
4. `artwork/[id]` 아티스트 어트리뷰션 정확
5. 사이즈 매트릭스 통과: `20x30in` → inch, `50x40cm` → cm, `100x80` → unitless, `30F` → 호수
6. KRW/USD 가격 표시 정확
7. Import 템플릿에 7개 필드만, 정직한 요약
8. Save 모달 간소화
9. Alerts 간소화
10. `/my/ops` 미노출
11. 빌드 통과

---

## 2026-03-30 — Beta Differentiation Wave 2.1 (integration)

Wave 2 표면을 실제 유저 워크플로우에 연결하는 통합 패치.

### 변경 요약

- **Scope A — Shortlist entry points**: `/artwork/[id]`에 "Save" 버튼 + `SaveToShortlistModal` 컴포넌트; `/e/[id]`에 "Save" 버튼 + 전시 shortlist 저장; 기존 shortlist 선택/생성/제거 가능; `shortlist_item_added`/`shortlist_item_removed` 분석 이벤트.
- **Scope B — Shortlist collaboration**: `/my/shortlists/[id]`에 collaborator 검색·추가·제거 UI; role 선택 (viewer/editor); share controls: copy link, rotate token (이전 링크 무효화), room active 토글; `shortlist_collaborator_added`/`room_copy_link` 이벤트.
- **Scope C — Room conversion**: `/room/[token]`에 "Ask about this work" CTA; `inquiry_clicked` 분석 로깅; `?fromRoom=` query로 artwork detail에 room breadcrumb; `room_viewed`/`room_opened_artwork`/`room_inquiry_clicked` 이벤트; private viewing room 레이블 + 만료 메시지.
- **Scope D — Alerts integration**: `notify_followers_new_work` trigger를 artist/medium interest 매칭으로 확장; follow 알림과 interest 알림의 payload `source` 구분; `digest_events` 테이블 + notification 기반 자동 큐 producer; `/my/alerts`에 digest preview; 알림 텍스트에서 follow vs interest 구분.
- **Scope E — Pipeline collaboration**: `inquiry_notes` RLS를 author-only → artwork artist + assignee 접근 가능하도록 변경; `auto_update_last_contact_date` 트리거 (message 삽입 시 + stage 변경 시); `/my/inquiries`에 "Assign to me" 버튼 + assigned 뱃지.
- **Scope F — Import v2**: 지원 컬럼 7→15개로 확장 (description, visibility, price, currency, is_price_public, artist_name, tags 등); title+year 기반 중복 검출 + skip duplicates 옵션; 개선된 매핑 UI (2-column grid) + 완료 요약.
- **Scope G — Ops panel v2**: 필터 추가 (with_delegations, recent_7d); 행별 "Profile link" 복사 + "Username fix" 링크 복사; CSV export; 5-KPI 대시보드.

### 신규 파일

| 파일 | 설명 |
|---|---|
| `supabase/migrations/p0_wave2_1_integration.sql` | Wave 2.1 스키마: share controls, notes RLS v2, last_contact triggers, interest notification, digest queue |
| `src/components/SaveToShortlistModal.tsx` | 범용 "Save to shortlist" 모달 |

### 수정 파일

| 파일 | 변경 |
|---|---|
| `src/lib/beta/logEvent.ts` | 7개 신규 이벤트 타입 추가 |
| `src/lib/supabase/shortlists.ts` | `rotateShareToken`, `toggleRoomActive`, `setRoomExpiry`, `searchProfilesForCollab`, `getShortlistIdsForArtwork`, `removeArtworkFromShortlist`; `room_active`/`expires_at` 타입 |
| `src/lib/supabase/alerts.ts` | `DigestEventRow` 타입, `listPendingDigestEvents` |
| `src/lib/supabase/notifications.ts` | `new_work` 타입 (Wave 2에서 추가됨, 유지) |
| `src/app/artwork/[id]/page.tsx` | Save 버튼 + modal + `fromRoom` breadcrumb |
| `src/app/e/[id]/page.tsx` | Save 버튼 + modal |
| `src/app/my/shortlists/[id]/page.tsx` | Collaborator UI + share controls (전면 재작성) |
| `src/app/room/[token]/page.tsx` | Inquiry CTA + analytics + 만료 처리 (전면 재작성) |
| `src/app/my/inquiries/page.tsx` | Assignee 컨트롤 |
| `src/app/my/library/import/page.tsx` | v2: 확장 컬럼 + 중복 검출 (전면 재작성) |
| `src/app/my/ops/page.tsx` | Actionable controls + CSV export (전면 재작성) |
| `src/app/my/alerts/page.tsx` | Digest preview 섹션 |
| `src/app/notifications/page.tsx` | `new_work` source 구분 (follow vs interest) |

**Supabase SQL 적용 필요:** `supabase/migrations/p0_wave2_1_integration.sql` — Wave 2 SQL 이후에 실행.

**환경 변수:** 변경 없음.

### Acceptance checks

1. `/artwork/[id]` → "Save" → shortlist 선택/생성 → 중복 안전
2. `/e/[id]` → "Save" → 전시를 shortlist에 추가
3. `/my/shortlists/[id]` → collaborator 검색·추가·제거 + role badge
4. `/my/shortlists/[id]` → rotate link → 이전 `/room/` 링크 404
5. `/room/[token]` → "Ask about this work" CTA → `inquiry_clicked` 로그
6. `/room/[token]` → 작품 클릭 → `/artwork/[id]?fromRoom=` → room breadcrumb 표시
7. Saved interest (medium: "Oil") → 아티스트가 Oil 작품 업로드 → interest 알림 생성
8. 알림 텍스트: follow 출처 vs interest 출처 구분
9. `/my/alerts` → digest preview에 pending events 표시
10. `inquiry_notes` → artist + assignee 접근 가능 (author-only 아님)
11. Message 전송 → `last_contact_date` 자동 업데이트
12. `/my/inquiries` → "Assign to me" → assigned badge
13. CSV import → 15개 컬럼 매핑 + 중복 검출 + skip
14. `/my/ops` → CSV export + profile link 복사 + recent_7d 필터
15. `npx tsc --noEmit` 통과

---

## 2026-03-30 — Beta Differentiation Wave 2

### 변경 요약

- **Scope A — Shortlists / Private Rooms**: `shortlists`, `shortlist_items`, `shortlist_collaborators`, `shortlist_views` 테이블; `/my/shortlists` (목록·생성), `/my/shortlists/[id]` (상세·편집), `/room/[token]` (공유 뷰잉 룸); `get_shortlist_by_token`, `get_shortlist_items_by_token` RPC; 조회·열기·inquiry_clicked 분석.
- **Scope B — Sales Pipeline Lite**: `pipeline_stage` enum (`new`~`closed_lost`), `assignee_id`, `next_action_date`, `last_contact_date` 컬럼 추가; `inquiry_notes` 내부 메모 테이블; `update_inquiry_pipeline` RPC; `/my/inquiries`에 pipeline 필터·단계 변경·next action 날짜·내부 메모 UI.
- **Scope C — Structured Import/Export**: `src/lib/csv/parse.ts` 클라이언트 CSV 파서·생성·다운로드; `/my/library/import` 위자드 (붙여넣기 → 매핑 → 유효성 검사 → 가져오기); `/my/library`에 Export CSV 버튼.
- **Scope D — Follow Alerts/Digest**: `alert_preferences`, `saved_interests` 테이블; `notify_followers_new_work` 트리거 (공개 작품 업로드 시 팔로워에게 알림); `/my/alerts` 설정 페이지 (신작 알림 토글, digest 빈도, 관심사 저장).
- **Scope E — Ops Panel**: `ops_onboarding_summary` RPC; `/my/ops` 페이지 (전체 프로필 수, 난수 아이디, 미업로드, 대리 위임 현황; 필터링 테이블).

### 신규 파일

| 파일 | 설명 |
|---|---|
| `supabase/migrations/p0_wave2_differentiation.sql` | 전체 Wave 2 스키마 |
| `src/lib/supabase/shortlists.ts` | Shortlist CRUD + room RPC |
| `src/lib/supabase/alerts.ts` | Alert preferences + saved interests |
| `src/lib/csv/parse.ts` | CSV 파서·생성·다운로드 |
| `src/app/my/shortlists/page.tsx` | 숏리스트 목록 |
| `src/app/my/shortlists/[id]/page.tsx` | 숏리스트 상세 |
| `src/app/room/[token]/page.tsx` | 공유 뷰잉 룸 |
| `src/app/my/library/import/page.tsx` | CSV 가져오기 위자드 |
| `src/app/my/alerts/page.tsx` | 알림 설정 |
| `src/app/my/ops/page.tsx` | 베타 운영 패널 |

### 수정 파일

| 파일 | 변경 |
|---|---|
| `src/lib/supabase/priceInquiries.ts` | `PipelineStage` 타입, pipeline 컬럼, `updateInquiryPipeline`, `listInquiryNotes`, `addInquiryNote` |
| `src/app/my/inquiries/page.tsx` | Pipeline 필터·단계 변경·next action·내부 메모 UI |
| `src/app/my/library/page.tsx` | Import/Export 버튼 추가 |

**Supabase SQL 적용 필요:** `supabase/migrations/p0_wave2_differentiation.sql` — Wave 1 SQL 이후에 실행.

**환경 변수:** 변경 없음.

---

## 2026-03-30 — Beta Hardening Wave 1.1 (reconciliation)

Wave 1 (2026-03-27)에서 HANDOFF에 기술되었으나 main에 실제 반영되지 않았던 항목을 정합 패치.

### 이전에 불일치했던 사항 및 수정 내역

| 항목 | 불일치 | 수정 |
|---|---|---|
| Feed `getFollowingIds` 중복 | `listFollowingArtworks` 내부에서 `follows` 테이블을 다시 쿼리 → FeedContent의 `getFollowingIds()`와 동일 데이터 이중 fetch | `FollowingOptions.followingIds` 추가; FeedContent에서 미리 가져온 ID를 전달하여 내부 follows 쿼리 생략 |
| Feed instrumentation payload 부족 | `feed_data_loaded` 이벤트에 `item_count`, `source`, `duration_ms` 누락 | 이벤트명 `feed_loaded`로 정규화; 모든 피드 이벤트에 `item_count`, `source`, `duration_ms` 추가 |
| Feed TTL dev 로깅 없음 | pathname/focus/visibility TTL skip 시 디버그 정보 없음 | `NODE_ENV=development`일 때 `console.debug`로 skip 사유·경과 시간 출력 |
| Artwork detail inquiry: one-shot | `/artwork/[id]`의 inquirer·artist view 모두 `artist_reply` 단일 필드만 표시, 스레드 미노출 | `listPriceInquiryMessages` + `appendPriceInquiryMessage` 연동; inquirer도 follow-up 가능; artist는 closed 전까지 계속 답변 가능 |
| HANDOFF: reconciliation 섹션 부재 | Wave 1 HANDOFF가 "완료됨" 기술이나 실제 main과 불일치 | 본 섹션 추가 |

### Acceptance checks

- `getFollowingIds` — FeedContent 내 호출 2회(all/following 분기 각 1회), `listFollowingArtworks`에 `followingIds` 전달하여 내부 중복 제거
- `window.addEventListener("scroll"` — FeedContent에 없음 (IO만 사용)
- Following 탭 load-more — `followingArtCursor` + `followingExhCursor`로 무한 페이지
- 90s TTL — `FEED_BG_REFRESH_TTL_MS = 90_000`; pathname/focus/visibility는 TTL 미만이면 skip
- `/notifications` mount 시 `markAllAsRead()` 호출 없음
- 개별 알림 click → `markNotificationRead(row.id)` 호출
- "Mark all as read" 버튼 존재
- Artwork detail: inquirer 스레드 표시 + follow-up; artist 스레드 표시 + 복수 답변
- `npx tsc --noEmit` 통과
- `npm run build` 통과 (exit 0, 21s)
- 변경 파일 대상 `eslint` 통과

**변경 파일:** `src/lib/supabase/artworks.ts`, `src/components/FeedContent.tsx`, `src/lib/beta/logEvent.ts`, `src/app/artwork/[id]/page.tsx`, `docs/HANDOFF.md`, `docs/QA_SMOKE.md`

**Supabase SQL:** 추가 마이그레이션 없음. Wave 1의 `p0_beta_hardening_wave1.sql`이 이미 적용되어 있으면 충분.

**환경 변수:** 변경 없음.

---

## 2026-03-27 — Beta Hardening Wave 1 (ops depth)

- **피드 (`FeedContent`)**: 팔로잉 탭에 작품·전시 **커서 페이지네이션** 및 load-more; `getFollowingIds` 단일 호출; pathname/focus/visibility는 **90s TTL**로만 백그라운드 갱신(수동 새로고침은 강제); IntersectionObserver만 사용(스크롤 폴백 제거); `beta_analytics_events`에 피드 로드/첫 페인트/ loadMore 계측.
- **가격 문의**: `price_inquiry_messages` 스레드 API 정리; 작가 인박스는 `artworks!inner`로 **서버 필터 + 키셋 페이지**; `/my/inquiries`에 상태 필터·검색·스레드·읽음(`mark_price_inquiry_read`)·답변 append.
- **알림**: 목록 진입 시 **전체 읽음 자동 처리 제거**; 행 클릭 시 해당 알림만 읽음; **「모두 읽음」** 버튼 별도. 가격 문의 알림 링크 → `/my/inquiries`.
- **라이브러리**: `/my/library` — `listMyArtworksForLibrary` 기반 필터·정렬·더 보기; `/my`에서 링크(대리 로그인 시 숨김).
- **벌크 업로드**: 제목 접두/접미/치환(확인 모달), 사이즈·단위, 고정가·통화·가격 공개, 전시 연결/해제, CSV 텍스트 붙여넣기로 초안 생성, 벌크 발행 시 `bulk_publish_completed` 이벤트.
- **분석·기타**: `LikeButton`/`FollowButton`/전시 생성에 베타 이벤트; `/my/diagnostics`(개발 또는 `NEXT_PUBLIC_DIAGNOSTICS=1`); Playwright 최소 스모크; README·`docs/QA_SMOKE.md`·Runbook·`.env.example` 갱신.

**Supabase SQL 적용 필요:** `supabase/migrations/p0_beta_hardening_wave1.sql` (이미 적용한 환경은 재실행 idempotent).

**환경 변수:** (선택) `NEXT_PUBLIC_DIAGNOSTICS=1` — 프로덕션에서 진단 페이지 노출. `.env.example` 및 `docs/03_RUNBOOK.md` 반영됨.

**Verified:** 변경 파일 대상 `eslint` 통과; `npm run build` 통과.

## 2026-03-23 — 난수 아이디 1회성 유도 개선(나중에 비영구)

- 로그인/매직링크 콜백 후 난수 아이디(`user_XXXXXXXX`) 감지 시 `/username-fix` 안내 페이지로 유도.
- `/username-fix`의 `나중에` 동작을 **비영구 처리**로 변경:
  - localStorage dismiss를 저장하지 않음.
  - 세션 prompt 플래그만 정리하고 기존 경로로 이동.
  - 이후 재진입 시 다시 안내 노출 가능(적극 유도).
- 설정 페이지에서 유저네임 입력/검증/중복 체크 후 저장 가능하도록 반영.
- 랜덤 아이디 판별 로직을 공용 유틸(`src/lib/profile/randomUsername.ts`)로 통일.

**Supabase SQL 적용 필요:** 없음.

**Verified:** `ReadLints` 통과, `npm run build`는 기존과 같이 환경에서 장시간 빌드 단계 대기(완료 로그 미수집).

## 2026-02-19 — 전시 관리자 초대·작가 버킷·벌크 전시 컨텍스트

- **전시 관리자 초대: 유저 검색 + 이메일**
  - 전시 편집(`/my/exhibitions/[id]/edit`)·전시 작품 추가(`/my/exhibitions/[id]/add`)에서 관리자 초대 시: **가입한 유저**는 이름·@유저네임 검색으로 선택 후 `createDelegationInviteForProfile`(project scope)로 앱 내 초대. **미가입자**는 기존처럼 이메일 입력 후 `createDelegationInvite` + 초대 메일 발송.
- **전시 작품 추가: 작가 단위 버킷**
  - 2단계(작품 선택)에서 참여 작가·외부 작가마다 **버킷** 하나씩 표시. 각 버킷: (1) **드롭 존** — 로컬 이미지 파일 1점 드롭 → 단일 업로드, 2점 이상 → 벌크 업로드로 이동(파일은 `pendingExhibitionUpload` 스토어로 전달). (2) **단일 작품 추가**·**벌크 작품 추가** 버튼. 참여 작가 없으면 "1단계에서 참여 작가 추가" 안내.
- **벌크 업로드: 전시·작가 컨텍스트**
  - 전시 작품 추가에서 벌크 링크 시 `addToExhibition`·`from=exhibition`·`artistId`(또는 외부는 `externalName`·`externalEmail`) 쿼리 전달. 벌크 페이지에서 이 파라미터 있으면 intent=CURATED·작가/외부 preselected·attribution 스킵 후 바로 업로드 단계. 드롭한 파일이 있으면 스토어에서 꺼내 `pendingFiles`에 추가. 발행 시 `projectId`로 클레임 연결·전시에 작품 추가 후 전시 작품 추가 페이지로 리다이렉트.
- **단일 업로드**: 전시에서 진입 시 드롭한 파일 1개가 스토어에 있으면 `setImage`·`setStep("form")`으로 폼 단계 직진입.
- **API**: `PublishWithProvenanceOptions`에 `projectId` 추가. `publishArtworksWithProvenance`에서 CURATED/INVENTORY 클레임 생성 시 `projectId` 전달.
- **문서**: `docs/EXHIBITION_ADD_WORKS_ROOT_CAUSE.md`(작가 중복 선택 루프 원인), `docs/EXHIBITION_ARTIST_BUCKETS_DESIGN.md`(작가 버킷·DnD 설계), `docs/ONBOARDING_UX_FLOWS.md`(온보딩·난수아이디 UX 플로우).

**Supabase SQL 적용 필요:** 없음.

**Verified:** `npm run build` 통과.

---

## 2026-02-19 — 온보딩 UX 개선 (매직링크 진입·난수 아이디 배너)

- **매직링크 진입 시 프로필 폼 노출**
  - `ProfileBootstrap`: `pathname === "/onboarding"`일 때 `ensure_my_profile()` 호출 생략. 매직링크 클릭 → 콜백에서 `/onboarding` 이동 시 프로필이 생성되지 않아, 온보딩에서 유저아이디·공개 이름·역할을 한 번에 입력 후 저장 (추가 매직링크 발송 없음).
- **온보딩 문구**
  - "프로필 완성" 화면에 "유저 아이디와 공개 이름을 입력하세요. 추가 이메일 링크는 발송되지 않습니다" 안내 추가 (i18n: `onboarding.completeProfileHint`).
- **제출 후 이동**
  - 프로필 제출 후 비밀번호 미설정(`HAS_PASSWORD_KEY` 없음)이면 `/set-password`, 있으면 `/feed`로 이동.
- **난수 아이디 사용자 배너**
  - `username`이 `user_` + 8자 16진수 패턴인 사용자에게 헤더 하단에 안내 배너: "설정에서 유저 아이디를 설정하세요" + 설정 링크. 닫기 시 `localStorage`에 저장해 재노출 안 함 (`RandomIdBanner`).
- **문서**
  - `docs/ONBOARDING_AND_USERNAME_AUDIT.md`에 §7 벤치마킹·적용 개선 사항 추가.

**Supabase SQL 적용 필요:** 없음.

**Verified:** `npm run build` 통과.

---

## 2026-02-19 — 업로더 삭제 권한·사이즈 단위·피드 더 불러오기

- **1) 업로드 당사자 삭제 권한**
  - `artworks.created_by` 컬럼 추가 (업로드한 프로필 ID). `canDeleteArtwork`: artist 또는 claim 보유자 또는 **created_by**일 때 삭제 허용.
  - RLS: artworks DELETE, artwork_images DELETE에 `created_by = auth.uid()` 조건 추가.
  - 싱글/드래프트 생성 시 `created_by` = 세션 유저로 설정.

- **2) 작품 사이즈 단위 보존·표시**
  - `artworks.size_unit` 추가 (`'cm' | 'in' | null`). 사용자 입력 단위를 저장.
  - `parseSizeWithUnit()`: 입력 문자열에서 단위 감지. `formatSizeForLocale(size, locale, sizeUnit)`: size_unit이 'in'이면 KO에서만 cm로 변환 표시, 'cm'이면 EN에서만 in으로 변환 표시.
  - 싱글 업로드·작품 수정 시 `parseSizeWithUnit`으로 단위 저장.

- **3) 피드 무한 스크롤(더 불러오기)**
  - **전체** 탭: `listPublicArtworks`에 cursor 페이지네이션 (`ArtworkCursor`), `listPublicExhibitionsForFeed`에 cursor. 응답에 `nextCursor` 포함.
  - `FeedContent`: 스크롤 끝 감지(IntersectionObserver) 시 `loadMore()`로 다음 페이지 요청 후 피드에 이어붙임. **팔로잉** 탭은 기존대로 한 번만 로드.

- **4) 벌크 업로드·외부 작가 이름**
  - 외부 작가 이름 최소 2자 + **다음** 버튼을 눌러야 업로드 단계로 이동 (1자 입력만으로 자동 전환 방지). `attributionStepDone` 상태로 명시적 진행.

**Supabase SQL 적용 필요:**  
- `supabase/migrations/p0_artworks_created_by_and_size_unit.sql`

**Verified:** (빌드·타입 체크 후, 삭제 권한·사이즈 표시·피드 스크롤 더 불러오기·벌크 다음 버튼 동작 확인 권장.)

---

## 2026-02-19 — 관리자 위임(Delegation): 전시/계정 관리 권한 공유

- **목적**: 특정 전시 또는 계정에 대한 관리 권한을 다른 사용자에게 위임. (매니저·큐레이터·어시스턴트 등)
- **DB**
  - **`delegations`** 테이블: `delegator_profile_id`, `delegate_profile_id`(nullable), `delegate_email`, `scope_type`(account|project|inventory), `project_id`(scope=project 시), `permissions`, `invite_token`, `status`(pending|active|revoked).
  - 마이그레이션: `p0_delegations.sql`, `p0_delegations_exhibition_works_projects_rls.sql`.
  - 신규 가입 시 `delegate_email`이 일치하는 pending 위임은 트리거로 자동 연결(`delegate_profile_id` 설정, status=active).
- **플로우**
  - **초대**: 전시 “작품 추가” 페이지에서 “관리자 초대”로 이메일 입력 → `create_delegation_invite` RPC → `/api/delegation-invite-email`로 초대 메일 발송. 링크: `{NEXT_PUBLIC_APP_URL}/invites/delegation?token=...` (Vercel에 NEXT_PUBLIC_APP_URL 설정 필수. Runbook 참고.)
  - **수락**
    - **케이스 A (이미 로그인)**: 초대 링크 접속 → “수락” 클릭 → `accept_delegation_by_token` (세션 이메일과 초대 이메일 일치 시에만). 위임 2개 이상이면 `/my/delegations`, 1개면 해당 전시 추가 페이지 또는 `/my/delegations`로 이동.
    - **케이스 B (미로그인)**: “로그인하여 수락” → `/login?next=/invites/delegation?token=...` → 로그인(비밀번호 또는 매직링크) 후 콜백에서 `next` 있으면 해당 URL로 리다이렉트 → 케이스 A와 동일 수락.
  - **신규 유저**: 초대 링크로 가입 시 기존 온보딩(유저네임·프로필명·역할) 유지. 가입 완료 후 트리거로 해당 이메일의 pending 위임이 자동 활성화.
- **RLS**
  - `exhibition_works`: insert/update/delete 시 전시 소유자(curator/host) 또는 **해당 전시에 대한 project-scope delegation이 있는 delegate** 허용.
  - `projects`: update만 delegate 허용(insert/delete는 curator/host만).
- **UI**
  - `/my/delegations`: 받은 위임·보낸 위임 목록. “Manage”로 전시 추가 페이지 이동 시 “acting as” 배너 표시.
  - 헤더: “acting as” 중일 때 “관리 중: {이름}” 배너 + “내 계정으로 전환” 버튼. 아바타 메뉴에 “위임” 링크.
  - 로그인·콜백: `next` 쿼리 파라미터 지원(초대 수락 후 직행).
- **알림**: 위임 수신 시 앱 내 알림은 추후 알림 시스템 정비 시 추가 예정.

**Supabase SQL 적용 필요:**  
- `supabase/migrations/p0_delegations.sql`  
- `supabase/migrations/p0_delegations_exhibition_works_projects_rls.sql`  

**Verified:** (빌드·타입 체크 후, 전시 추가 페이지에서 관리자 초대 → 이메일 수신 → 수락 플로우·RLS 동작 확인 권장.)

---

## 2026-02-22 — 매직링크 온보딩: 인증 메일 중복·난수 아이디 방지

- **문제**: 매직링크 가입 후 프로필(유저네임·디스플레이네임·페르소나) 입력 후 확인 시 “인증 메일이 다시 간다”는 인식, 일부 유저가 난수 아이디로 남는 현상.
- **원인 정리**  
  - “인증 메일이 다시 간다”: 프로필 완료 화면의 “Set password” 버튼이 `sendPasswordReset`로 **비밀번호 재설정 메일**을 발송함. 매직링크 유저는 이후 `/set-password`로 이동해 앱 내에서 비밀번호를 설정하므로, 온보딩에서 이메일 발송은 불필요하고 혼동만 유발.  
  - 이메일·비밀번호 **신규 가입** 시에만 Supabase가 “회원가입 확인” 메일을 보냄(프로필 폼 제출과는 무관).  
  - 난수 아이디: 프로필 저장 실패 시 에러 메시지가 불명확해 재시도가 줄어들 수 있음.
- **변경 사항**  
  1. **Auth 콜백** (`/auth/callback`): 세션 확정 후 프로필 유무·비밀번호 설정 여부를 판단해 한 번에 리다이렉트. (프로필 없음 → `/onboarding`, 비밀번호 미설정 → `/set-password`, 그 외 → `/feed`.)  
  2. **온보딩(프로필 모드)**: “Set password” 버튼(이메일 발송) 제거. “Continue를 누르면 다음 화면에서 비밀번호를 설정할 수 있습니다” 안내만 유지.  
  3. **프로필 저장 실패 시**: 에러 메시지를 “프로필 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.” 등으로 명확히 표시.
- **Supabase 권장**: 이메일·비밀번호 가입 시 “확인 메일” 없이 바로 세션을 주고 싶다면, Dashboard → Authentication → Providers → Email → **Confirm email** 비활성화. (보안상 확인 메일을 유지할 경우 현재 동작 유지.)

**Verified:** (매직링크 로그인 → 프로필 입력 → Continue → set-password 화면으로 이동, 이메일 미발송 확인 권장.)

---

## 2026-02-22 — 업로드 탭 구조·의도 라벨·전시 생성·기존 작품 추가

- **업로드 탭 3개**: "개별 업로드" | "벌크(일괄) 업로드" | "전시 만들기". `/upload` 레이아웃에서 탭으로 이동, 전시 만들기는 `/my/exhibitions/new?from=upload`로 이동 후 생성.
- **의도(분류) 4종**: "내 작품 (아티스트 페르소나만)", "소장 작품 (콜렉터 페르소나만)", "갤러리 - 전시 & 보유 (갤러리/갤러리스트 페르소나만)", "큐레이션 작품 (큐레이터 페르소나만)". 단일·벌크 업로드 모두 i18n 키로 통일.
- **전시 생성 직후**: 생성 완료 시 전시 상세가 아니라 **기존 작품 추가** 페이지(`/my/exhibitions/[id]/add`)로 리다이렉트해, 바로 기존 업로드 작품을 전시에 넣을 수 있게 함.
- **전시에 기존 작품 추가 시 프로비넌스**: 전시에 작품을 추가하면 `exhibition_works`에 넣는 것뿐 아니라, **CURATED** 프로비넌스 클레임을 자동 생성함. "이 작품을 이 전시에서 큐레이션했다"는 시제가 포함된 갤러리–큐레이터 프로비넌스가 한 번에 만들어짐. (작품이 내부 작가 프로필을 가질 때만 생성, 이미 클레임이 있으면 RPC 실패는 무시.)
- **업로드 시 전시에 곧바로 추가**: `/upload?addToExhibition=전시ID`로 업로드하면서 의도를 CURATED/INVENTORY로 선택하면, 클레임 생성 시 `project_id`에 해당 전시를 넣어 전시와 프로비넌스가 연결됨.

### 전시·기존 작품·프로비넌스 동작 (쉬운 설명)

1. **전시를 만들면**  
   제목·기간 등을 입력해 전시 게시물을 만든 뒤, 곧바로 "기존 작품 추가" 화면으로 이동합니다.

2. **기존 작품을 전시에 넣으면**  
   내가 올린 작품·내가 리스팅한 작품 목록에서 골라 "추가"를 누르면, (1) 그 전시의 작품 목록에 들어가고, (2) 동시에 "이 작품을 이 전시에서 큐레이션했다"는 **프로비넌스(시제)** 가 자동으로 만들어집니다. 그래서 전시 게시물 생성과 갤러리–큐레이터 프로비넌스가 자연스럽게 맞습니다.

3. **새 작품을 올리면서 전시에 넣으면**  
   업로드 페이지에서 "전시에 추가"로 들어와 새 작품을 올리고, 의도를 "큐레이션 작품" 등으로 선택해 저장하면, 작품 생성·클레임·전시 연결이 한 번에 되고, 해당 전시 ID가 프로비넌스에 붙습니다.

4. **이미 만든 전시 수정**  
   전시 제목·기간·작품 구성 등 수정은 **업로드 탭이 아니라** "내 전시" 상세(`/my/exhibitions/[id]`)나 프로필의 전시 카드에서 진행합니다.

**Verified:** (빌드·린트 통과 후, 업로드 탭 3개·전시 생성 → 기존 작품 추가·프로비넌스 연동 플로우 확인 권장.)

---

## 2026-02-22 — i18n 옵션 C: 커버리지 확대 + 아티스트 중심 번역

- **방향**: “둘 다 + 지속적 통일감 유지” 적용. KO 선택 시 노출되는 영문 하드코딩 제거, 아티스트·커뮤니티 맥락에 맞는 한국어 문구 사용.
- **신규 키 (en/ko 쌍)**: `common.*`(에러/안내/라벨), `upload.*`(의도·소유·가격·플레이스홀더·라벨), `exhibition.*`, `settings.*`(플레이스홀더·라벨), `login.*`, `onboarding.*`, `setPassword.*`, `authReset.*`, `my.*`, `bulk.*`, `app.title`/`app.description` 등 대량 추가.
- **치환 범위**: 업로드(의도/폼/디덱), 전시(내 전시 상세·편집·작품 추가·목록), My(프로필/통계 에러·전시 버튼), 클레임/가격문의(에러·토스트), 로그인(플레이스홀더), 설정(플레이스홀더·라벨·Retry details·Dev debug), 공개 전시 `/e/[id]`(Not found). placeholder "DELETE"는 삭제 확인용으로 번역 없이 유지.
- **기존 ko 문구**: 변경 없음. 누락 키 보강 및 하드코딩 제거만 수행.
- **메타**: `layout` 제목/설명을 `app.title`/`app.description` 톤으로 수정(영문).

**Verified:** (빌드·린트 통과 후, KO 토글 시 업로드/전시/My/설정 등 주요 플로우에서 한국어 노출 확인 권장.)

---

## 2026-02-20 — i18n·언어 통일 개선 방안 정리 + 브라우저 자동번역 방지

- **문서**: `docs/I18N_IMPROVEMENT_OPTIONS.md` — 현재 이슈(KO에서 영문 노출, 브라우저 자동번역 충돌), 벤치마킹, 옵션 A/B/C/D와 장단점·권장 순서 정리.
- **옵션 A 적용 (기능 영향 없음)**  
  - **`<html lang>` 동기화**: 클라이언트에서 선택 로케일(쿠키)에 따라 `document.documentElement.lang`을 `en`/`ko`로 설정하는 `HtmlLangSync` 컴포넌트 추가.  
  - **`<body translate="no">`**: 앱 전체를 브라우저 자동 번역에서 제외해 "Feed → 먹이", "Abstract → 초록" 등 이중 번역 방지.  
  - **브랜드 "Abstract"**: `<span translate="no">`로 감싸 명시적 제외( body 에 이미 `translate="no"` 적용으로 중복이지만 브랜드 보호 강화).

**Verified:** (배포 후 KO 선택 시 메뉴는 기존과 동일; 브라우저 번역 시 앱 문구가 덮어씌워지지 않는지 확인 권장.)

---

## 2026-02-20 — 가격문의 답변 시 RLS 오류 수정

- **증상**: 패치 이전에 올라온 가격문의에 작가가 답변을 저장할 때 `new row violates row-level security policy for table "price_inquiries"` 발생.
- **원인**: `p0_claims_period_and_price_inquiry_delegates.sql`의 UPDATE 정책 `price_inquiries_update_reply`가 **WITH CHECK**에서 `replied_at is null`을 요구함. 답변 저장 시 `replied_at`을 설정하므로 갱신된 행이 이 조건을 만족하지 않아 RLS에 걸림.
- **수정**: WITH CHECK에서는 “수정 후 행”에 대해 `replied_at is null`을 요구하지 않고, 응답 권한(작가/대리인)만 검사하도록 변경. **USING**은 그대로 두어 “아직 답 없는 문의만 수정 가능” 유지.
- **Supabase SQL**: `supabase/migrations/p0_price_inquiry_update_rls_fix.sql` 실행 필요.

**Verified:** (배포 후 기존 가격문의 답변 저장 동작 확인 권장.)

---

## 2026-02-19 — 피드 전시 노출 + 공개 전시 페이지 + 전시 미디어 자유 버킷 + 탭 재정렬

- **피드**: 팔로우 중인 프로필이 큐레이터/호스트인 전시를 피드에 노출. `listExhibitionsForFeed(profileIds)`로 조회 후 작품과 `created_at` 기준으로 병합, 5개마다 discovery 블록 끼워 넣기. `FeedExhibitionCard`로 전시 카드 표시.
- **피드(수정)**: 전체 탭은 `listPublicExhibitionsForFeed()`로 퍼블릭 전시 전체를 노출하도록 변경(팔로우 기반 제한 해제). 따라서 본인 전시도 전체 피드에서 노출됨.
- **피드 전시 카드 UI 1차 정리**: 전시 카드 크기를 작품 카드와 유사한 체급으로 조정하고, 기간/장소가 카드 본문에서 항상 보이도록 레이아웃 변경. 썸네일 스택 화질은 `thumb`→`medium`으로 상향.
- **피드 전시 카드 UI 2차 정리(사람 추천 톤 정렬)**: 전시 추천 블록을 사람 추천 블록과 유사한 패턴(헤더 + 하단 썸네일 그리드)으로 변경. 전시 블록 span을 `lg:col-span-2`로 맞춰 피드 리듬/조화를 개선.
- **공개 전시 페이지**: `/e/[id]` — 읽기 전용. 작가별 작품 버킷, 전시전경/부대행사(및 자유 제목 버킷) 섹션. 소유자(큐레이터/호스트)는 "전시 관리" 링크로 `/my/exhibitions/[id]` 이동.
- **전시 미디어 자유 제목 버킷**: `exhibition_media`에 `bucket_title` 컬럼 추가, `type`에 `custom` 허용. 전시 상세·공개 페이지에서 버킷별 그룹 표시(제목 = bucket_title ?? 기본 라벨). 내 전시 상세에서 "사진 추가" per 버킷, "버킷 추가"(제목 + 첫 사진)로 커스텀 섹션 생성. **Supabase SQL**: `p1_exhibition_media_bucket_title.sql` 실행 필요.
- **전시 DnD 확장**: 내 전시 상세에서 (1) 아티스트 버킷 순서 DnD, (2) 아티스트 버킷 내부 작품 순서 DnD, (3) 미디어 버킷 순서 DnD, (4) 미디어 버킷 내부 이미지 순서 DnD, (5) 미디어 삭제, (6) 미디어 벌크 업로드 + 업로드 전 순서 DnD를 지원.
- **빈 버킷 순서 영구 저장**: `exhibition_media_buckets` 메타 테이블 추가로 이미지가 0장인 버킷도 순서를 유지. **Supabase SQL**: `p2_exhibition_media_buckets.sql` 실행 필요.
- **전시 삭제 옵션**: `/my/exhibitions/[id]/edit`에 전시 전체 삭제 추가.  
  - 옵션 A: 전시 이력만 삭제(작품/프로비넌스 유지)  
  - 옵션 B: 전시 연동 작품까지 삭제(작품+프로비넌스 히스토리 포함)
- **전시 대표 썸네일 스택**: `projects.cover_image_paths`(text[]) 추가 후, 전시 상세에서 대표 썸네일 선택/순서 저장(최대 3개). 피드/내 전시 목록/내 프로필 전시 탭 카드에서 스택 썸네일 표시. **Supabase SQL**: `p3_exhibition_cover_image_paths.sql` 실행 필요.
- **탭 재정렬**: My 페이지 탭 옆 "↕" 클릭 시 순서 변경 모드. 위/아래 화살표로 순서 변경 후 "저장" 시 `profile_details.tab_order`에 저장. `getOrderedPersonaTabs(..., savedOrder)`로 저장된 순서 적용.

**Verified:** `npm run build` 통과.

### 피드 레이아웃 방향: 인스타형 vs 핀터레스트형

- **인스타형(통일 그리드)**  
  - 장점: 한눈에 정돈됨, 브랜드/포트폴리오 인상 강함, 팔로우·참여 전환에 유리(리서치에서 일관 그리드가 팔로우율·노출에 유리하다는 보고 있음).  
  - 단점: 세로형·가로형 작품이 섞이면 썸네일 크롭으로 일부 작품이 잘릴 수 있음.
- **핀터레스트형(매스너리/엇나감)**  
  - 장점: 원본 비율 유지, 시선 이탈·탐색에 유리.  
  - 단점: 피드가 산만해 보일 수 있고, “작가/갤러리” 정체성보다 “아이디어 수집” 느낌에 가깝다.

- **추천**: Abstract는 **인스타형(통일감 우선)** 유지가 적합.  
  - 목표가 “팔로우·참여·전시/작품 구매”이고, 작품 피드가 포트폴리오 역할을 하므로, 카드 크기·비율을 맞추고 추천 블록(사람/전시)도 동일한 라벨·타이포 규칙을 쓰는 쪽이 좋음.
- **적용**: (1) 추천 라벨 통일 — `Recommended · People` / `Recommended · Exhibitions` 동일 포맷. (2) 추천 블록 라벨 타이포 통일 — `text-xs font-medium uppercase tracking-wide text-zinc-500`. (3) 기본 피드 셀은 작품 카드 기준 정사각 유지, 모듈(사람/전시)은 `lg:col-span-2`로 동일 span 유지.

---

## 2026-02-19 — 탭 정리(갤러리/큐레이션 제거, 전체 버킷) + 전시 상세 작가별·전시전경/부대행사

- **탭**: 갤러리(INVENTORY), 큐레이션/전시(CURATED) 탭 제거. 비아티스트는 "전체" 탭이 항상 마지막(우측). 아티스트: 전체·전시·내 작품·소장. 콜렉터: 소장·전시·전체. 큐레이터/갤러리: 전시·전체.
- **전체 탭**: "전체" 선택 시 My work / Curated by me / Exhibited here / Collected 버킷(섹션)으로 표시.
- **전시 상세**: 작품을 작가별 버킷으로 표시(썸네일 그리드, 작게). 전시전경(installation), 부대행사(side_event) 섹션 추가(이미지 업로드 UI는 추후).
- **DB**: `p0_exhibition_media.sql` — 전시전경/부대행사용 `exhibition_media` 테이블. **Supabase SQL Editor에서 실행 필요.**

---

## 2026-02-19 — 클레임 기간(period) 기능 + 가격 문의 알림 수정 + 업로드 period 입력

오늘 작업: 클레임에 과거/현재/미래 기간 구분 추가, 작가가 클레임 확인 시 기간 수정 가능하도록 UI 반영. 가격 문의 알림이 일부 작가에게 가지 않던 문제 수정. 업로드 시 갤러리/큐레이터가 period_status 입력 가능하도록 추가.

### A. 클레임 기간(period_status) 기능 완성
- **DB**: `claims` 테이블에 `period_status` (past/current/future), `start_date`, `end_date` 컬럼 추가. `p0_claims_period_and_price_inquiry_delegates.sql`에서 기존 confirmed INVENTORY/CURATED/EXHIBITED는 `period_status = 'current'`로 backfill.
- **클레임 요청 UI**: 작품 상세에서 "curated by me" / "exhibited by me" 선택 시 **기간 선택**(과거 종료 / 현재 진행 / 미래 예정) 필드 표시. 요청 시 `createClaimRequest`에 `period_status` 전달.
- **클레임 확인 UI**: 작가가 pending 클레임 승인 시, CURATED/EXHIBITED는 **기간 수정 폼** 표시(기본값: 요청자가 제안한 period 또는 current). "기간 확정" 클릭 시 `confirmClaim(claimId, { period_status })` 호출. OWNS는 기간 없이 바로 승인.
- **RPC**: `createClaimRequest`, `confirmClaim`에 `period_status` 옵션 파라미터 추가. `PendingClaimRow` 타입에 `period_status`, `start_date`, `end_date` 필드 추가.
- **i18n**: `artwork.periodPast`, `artwork.periodCurrent`, `artwork.periodFuture`, `artwork.periodLabel`, `artwork.sendRequest`, `artwork.confirmWithPeriod` 추가(영/한).

### B. 가격 문의 알림 미수신 문제 수정
- **증상**: 일부 아티스트가 작품에 대한 가격 문의 알림을 전혀 받지 못함.
- **원인**: `price_inquiry_artist_id(artwork_id)`가 **CREATED 클레임의 subject_profile_id만** 반환. CREATED 클레임이 없는 작품(비공개/초안, 백필 누락, 레거시 데이터)은 `NULL` 반환 → 수신자 목록에서 제외되어 알림이 생성되지 않음.
- **수정**: `p0_price_inquiry_artist_id_fallback.sql` — `price_inquiry_artist_id` 함수를 **CREATED 클레임 우선, 없으면 `artworks.artist_id`로 fallback**하도록 변경. CREATED가 없어도 `artist_id`가 있으면 알림 수신 가능.
- **영향**: `can_reply_to_price_inquiry`, `can_select_price_inquiry`, `get_price_inquiry_recipient_ids` 모두 `price_inquiry_artist_id`를 사용하므로, fallback 적용 시 자동으로 `artist_id` 사용자도 답변·문의 조회·알림 수신 가능. CREATED와 `artist_id` 불일치 시 CREATED 우선(coalesce).

### C. 업로드 시 period_status 입력 기능 추가
- **업로드 플로우**: 갤러리/큐레이터가 작품 업로드 시 INVENTORY/CURATED 선택하면 **기간 선택 필드** 표시(과거/현재/미래). 기본값은 "현재 진행".
- **벌크 업로드**: 동일하게 period_status 선택 UI 추가. `publishArtworksWithProvenance` 호출 시 period_status 전달.
- **RPC 수정**: `create_external_artist_and_claim`, `create_claim_for_existing_artist`에 `p_period_status` 파라미터 추가. `p0_upload_claim_period_status.sql` 마이그레이션.
- **타입**: `CreateExternalArtistAndClaimArgs`, `CreateClaimForExistingArtistArgs`에 `period_status?: "past" | "current" | "future" | null` 추가.

### D. 타입 에러 픽스
- **증상**: 배포 빌드 실패 — `claimType === "EXHIBITED"` 비교에서 타입 오류(업로드 IntentType에 EXHIBITED 없음).
- **수정**: 업로드/벌크 업로드 페이지에서 `claimType === "INVENTORY" || claimType === "CURATED"`만 체크하도록 변경. EXHIBITED는 작품 상세에서만 사용(요청 플로우).

### E. 오늘 수정/추가된 파일 요약
| 구분 | 파일 | 내용 |
|------|------|------|
| DB | `p0_claims_period_and_price_inquiry_delegates.sql` | period_status 컬럼 추가, delegate 알림 로직, RLS 업데이트 |
| DB | `p0_price_inquiry_artist_id_fallback.sql` | **신규** — price_inquiry_artist_id에 artworks.artist_id fallback |
| DB | `p0_upload_claim_period_status.sql` | **신규** — 업로드 RPC에 period_status 파라미터 추가 |
| 앱 | `src/lib/provenance/rpc.ts` | createClaimRequest/confirmClaim에 period_status 옵션, PendingClaimRow에 period 필드 |
| 앱 | `src/app/artwork/[id]/page.tsx` | 클레임 요청/확인 UI에 period_status 선택 폼 추가 |
| 앱 | `src/app/upload/page.tsx` | 업로드 시 INVENTORY/CURATED 선택하면 period_status 입력 필드 |
| 앱 | `src/app/upload/bulk/page.tsx` | 벌크 업로드에도 period_status 선택 UI 추가 |
| 앱 | `src/lib/supabase/artworks.ts` | publishArtworksWithProvenance에 period_status 옵션 추가 |
| 앱 | `src/lib/provenance/types.ts` | CreateExternalArtistAndClaimArgs, CreateClaimForExistingArtistArgs에 period_status 추가 |
| 앱 | `src/lib/i18n/messages.ts` | period 관련 i18n 메시지 추가 |
| 문서 | `docs/PRICE_INQUIRY_NOTIFICATION_ANALYSIS.md` | **신규** — 가격 문의 알림 미수신 원인 분석 문서 |

### F. Supabase SQL 실행 순서 (기존 + 추가)
기존 순서대로 실행한 뒤, 필요 시 추가 마이그레이션 실행.

1. ~ 9. (기존과 동일)
10. **`p0_price_inquiry_artist_id_fallback.sql`** — 가격 문의 알림이 일부 작가에게 가지 않을 때 실행
11. **`p0_upload_claim_period_status.sql`** — 업로드 시 period_status 입력 기능 활성화

### G. 검증
- 클레임 요청: CURATED/EXHIBITED 선택 시 기간 선택 필드 표시, 요청 생성 성공.
- 클레임 확인: 작가가 pending CURATED/EXHIBITED 승인 시 기간 수정 폼 표시, period_status 저장 확인.
- 가격 문의 알림: CREATED 클레임 없는 작품도 `artist_id` 기반으로 알림 수신 확인.
- 업로드: 갤러리/큐레이터가 작품 업로드 시 period_status 입력 및 클레임 생성 확인.

---

## 2026-02-19 — 가격 문의·클레임 안정화 + 작품 삭제 CASCADE

오늘 작업: 가격 문의·"이 작품은…" 클레임 기능이 400 에러를 내던 원인을 정리하고, DB·앱을 수정해 두 기능이 안정 동작하도록 반영함. 작품 삭제 시 클레임 때문에 실패하던 문제 해결.

### A. 42703(undefined_column) 대응
- **증상**: 가격 문의 POST·클레임 요청 POST 시 400, Supabase 로그에 `PostgREST; error=42703`. 화면에는 "Failed to send inquiry" / "Request failed"만 표시.
- **원인**: 실제 DB에 일부 테이블/컬럼이 없거나 마이그레이션 적용 순서 차이로, 트리거·RLS가 참조하는 컬럼이 없을 때 42703 발생.
- **수정**:
  - **가격 문의용 artist 조회**: `price_inquiry_artist_id(artwork_id)`를 **claims만** 사용하도록 변경 (CREATED 클레임의 subject_profile_id). `artworks.artist_id`, `claims.status` 참조 제거 → 해당 컬럼이 없어도 42703 없음.
  - **notifications 컬럼 보강**: `p0_notifications.sql`·`p0_repair_42703.sql`에서 `artwork_id`, `claim_id`, `payload`를 `add column if not exists`로 보장.
  - **artworks.artist_id / claims.status**: `p0_claims_status_request_confirm.sql` 상단·repair에서 `add column if not exists`로 보장.
  - **복구 스크립트**: `p0_repair_42703.sql` — 컬럼 보강 + `price_inquiry_artist_id`·`artwork_artist_id` 함수 재정의. 42703 발생 시 Supabase SQL Editor에서 한 번 실행.

### B. RLS 무한 재귀 재발 방지
- **증상**: 피드/작품 목록에서 "infinite recursion detected in policy for relation 'artworks'", GET /artworks 500.
- **원인**: `p0_claims_status_request_confirm.sql`에서 claims 정책을 다시 만들 때 `exists (select 1 from artworks ...)`를 사용해, artworks SELECT → claims RLS → artworks 참조 → 재귀 발생.
- **수정**: `p0_claims_status_request_confirm.sql`에서 claims 정책 전부 **`artwork_artist_id(work_id) = auth.uid()`**만 사용하도록 변경. 동일 파일 상단에 `artwork_artist_id` 함수 정의 포함. 정책이 artworks를 직접 읽지 않아 재귀 제거.

### C. 에러 메시지 UI·콘솔 노출
- **증상**: Supabase가 준 실제 에러 메시지가 아니라 "Failed to send inquiry" / "Request failed"만 보임.
- **원인**: Supabase/PostgREST 에러가 `Error` 인스턴스가 아닌 `{ message, code }` 객체로 오는데, `error instanceof Error`만 체크해 fallback만 표시됨.
- **수정**:
  - `src/lib/supabase/errors.ts`: `formatSupabaseError(error, fallback)` — 객체·문자열·Error 모두에서 메시지 추출. `logSupabaseError(context, error)` — 브라우저 콘솔에 원본 에러 출력.
  - 작품 상세 페이지: 가격 문의·클레임 요청/승인/거절/삭제 실패 시 위 유틸 사용 + 콘솔 로그. 서버가 준 메시지가 화면에 표시되도록 함.

### D. 마이그레이션 idempotency(재실행 안전)
- **정책**: `p0_price_inquiries.sql` — price_inquiries 정책 생성 전 `drop policy if exists` 4개 추가. `p0_claims_status_request_confirm.sql` — claims_artist_confirm, claims_artist_reject 생성 전 `drop policy if exists` 추가. 동일 스크립트 재실행 시 정책 중복 오류 방지.

### E. 오늘 수정/추가된 파일 요약
| 구분 | 파일 | 내용 |
|------|------|------|
| DB | `p0_price_inquiries.sql` | price_inquiry_artist_id를 claims만 사용, 정책 drop 후 생성 |
| DB | `p0_claims_status_request_confirm.sql` | artwork_artist_id 정의, 정책에서 함수 사용, artist_id·정책 drop 보강 |
| DB | `p0_notifications.sql` | notifications에 artwork_id, claim_id, payload add column if not exists |
| DB | `p0_repair_42703.sql` | **신규** — 컬럼 보강 + artist resolver 함수 일괄 정리 (42703 시 1회 실행) |
| DB | `p0_claims_work_id_cascade.sql` | **신규** — claims.work_id foreign key를 ON DELETE CASCADE로 변경 |
| 앱 | `src/lib/supabase/errors.ts` | **신규** — formatSupabaseError, logSupabaseError |
| 앱 | `src/app/artwork/[id]/page.tsx` | 에러 시 위 유틸 사용 및 콘솔 로그 |

### F. Supabase SQL 실행 순서 (기존 + 보강)
기존 순서대로 실행한 뒤, 필요 시 추가 마이그레이션 실행.

1. ~ 7. (기존과 동일: p0_claims_sync_artwork_artist … p0_price_inquiries)
8. **(선택)** `p0_repair_42703.sql` — 42703 또는 "column … does not exist" 발생 시 실행
9. **`p0_claims_work_id_cascade.sql`** — 작품 삭제 시 클레임 때문에 실패할 때 실행 (한 번만)

### G. 작품 삭제 CASCADE 수정
- **증상**: 작품 삭제 시 "update or delete on table 'artworks' violates foreign key constraint 'claims_work_id_fkey' on table 'claims'" 에러. 사진은 삭제되지만 작품 정보(metadata)는 남아 "껍데기"처럼 피드에 표시됨.
- **원인**: `claims.work_id`가 `artworks(id)`를 참조하는데 `ON DELETE CASCADE`가 없어, 작품 삭제 시 관련 클레임이 있으면 foreign key constraint 위반으로 삭제 실패.
- **수정**: `p0_claims_work_id_cascade.sql` — `claims.work_id` foreign key를 `ON DELETE CASCADE`로 변경. 작품 삭제 시 관련 클레임도 함께 삭제됨.
- **참고**: `price_inquiries.artwork_id`, `artwork_likes.artwork_id`는 이미 `ON DELETE CASCADE`. `notifications.artwork_id`는 `ON DELETE SET NULL` (알림은 남아도 됨).

### H. 검증
- 가격 문의: 가격 비공개 작품에서 "가격 문의하기" → 전송 성공, "작가가 여기에 답변할 예정입니다" 표시. 문의한 사용자만 해당 문의 상태 조회.
- "이 작품은…" 클레임: 옵션 선택 시 확정 요청 생성 성공, 작가 쪽 대기 목록·승인/거절 동작.
- 피드/작품 목록: infinite recursion·500 없이 로드.
- 작품 삭제: 클레임이 있는 작품도 삭제 성공, 작품 정보와 관련 클레임 모두 제거됨.

---

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

### I. 가격 문의 (Price inquiries)
- **플로우**: "Price upon request" / 가격 비공개 작품에 대해 방문자가 **가격 문의** 가능 → 작가가 `/my/inquiries`에서 답변. 문의자·작가 모두 알림 수신.
- **DB**: `p0_price_inquiries.sql` — `price_inquiries` 테이블(artwork_id, inquirer_id, message, artist_reply, replied_at), RLS(문의자 insert/본인 조회, 작가 해당 작품 조회·답변), `notifications` type check에 `price_inquiry` / `price_inquiry_reply` 추가, 트리거(문의 생성 → 작가 알림, 답변 → 문의자 알림).
- **앱**: `src/lib/supabase/priceInquiries.ts` (create, listForArtist, getMyInquiryForArtwork, reply). 작품 상세: 가격 비공개 시 "Ask for price" 버튼·폼. `/my/inquiries`: 작가용 문의 목록·답변 UI. `/my`: "가격 문의" 카드 링크. 알림 페이지에 가격 문의/답변 문구·링크. i18n `priceInquiry.*`, `notifications.priceInquiryText` / `priceInquiryReplyText`.

### 이번 릴리즈 Supabase SQL (수동 실행)
Supabase SQL Editor에서 아래 파일들을 **순서대로** 실행:
1. `supabase/migrations/p0_claims_sync_artwork_artist.sql`
2. `supabase/migrations/p0_artworks_provenance_visible.sql`
3. `supabase/migrations/p0_claims_status_request_confirm.sql`
4. `supabase/migrations/p0_claims_rls_break_recursion.sql`  ← **페이지 마비 해결**
5. `supabase/migrations/p0_ensure_my_profile_return_type.sql`  ← **400 ensure_my_profile 해결**
6. `supabase/migrations/p0_notifications.sql`  ← **알림(옵션 A)**
7. `supabase/migrations/p0_price_inquiries.sql`  ← **가격 문의**

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
  - env vars in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, **`NEXT_PUBLIC_APP_URL`** (초대 링크용), (선택) `SENDGRID_API_KEY`, `INVITE_FROM_EMAIL` (Prod/Preview/Dev). 상세: `docs/03_RUNBOOK.md`

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
