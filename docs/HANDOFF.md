# Abstract MVP — HANDOFF (Single Source of Truth)

Last updated: 2026-04-24

## 2026-04-24 — Studio portfolio tabs + studio tour step

### 요약

- **공개 작품 영역**: `profile_details.studio_portfolio`에 탭 순서·기본 탭 이름/공개 여부·커스텀 탭·작품 배치 저장. `/my`와 공개 프로필(`/u/...`)에 반영.
- **RPC**: `lookup_profile_by_username`이 `studio_portfolio`만 추가 반환 (`supabase/migrations/20260428000000_lookup_profile_studio_portfolio.sql`). 배포 시 Supabase에 마이그레이션 적용 필요.
- **스튜디오 투어**: `studio.main` 버전 **3**. 공개 작품·탭 안내 스텝(7·8) 스포트라이트는 **`studio-portfolio-tab-strip`**(탭 줄·↕·⚙만)으로 한정. 한국어 카피에서 「바깥」 표현 제거.

### Verified

- `npx tsc --noEmit` 통과.

### 2026-04-24 부록 — 투어 한글 깨짐(글리프)

- 원인: `Geist` `latin` 서브셋만 로드된 상태에서 일부 환경이 한글을 Geist로 치환해 **잘못된 글리프**로 그림.
- 조치: `globals.css`의 `body` 및 `@theme --font-sans`에 **시스템 CJK 폴백** 스택 추가, `Geist`에 `adjustFontFallback`, 투어 `TourOverlay` 루트에 `lang` 동기화.

---

## 2026-04-26 — Overlay Guided Tour System

### 왜 필요했나

`/my`, `/people`, `/upload`, `/my/exhibitions/new`, `/my/delegations`, `/my/network` 순으로 수차례 IA/UX 정돈 패치가 누적되면서 표면은 일관돼졌지만, 베타로 합류하는 초기 유저에게 "작업실·보드·위임·전시 게시물" 같은 Abstract 고유 개념이 여전히 낯설다. 텍스트 설명을 늘리는 대신, **첫 방문 1회성 가이드 오버레이**로 한 페이지의 2–5개 핵심 액션을 가볍게 짚어주는 시스템을 도입.

설계 기조:
- 과장하지 않는 premium/calm 톤, 1 타이틀 + 1–2문장.
- Registry/config 중심. 새 투어 추가나 카피 변경은 page 코드를 건드리지 않고 레지스트리만 수정.
- 앵커는 모두 `data-tour="..."` 속성. 텍스트/CSS 셀렉터 의존 금지.
- Per-user progress 영속화(DB+localStorage). 해제하면 재방문 시 재등장하지 않음.
- Version bump시에만 다시 한 번 노출.
- Missing anchor는 **silently skip**하여 조건부 UI에서도 안전.

### 아키텍처

```
src/lib/tours/
  tourTypes.ts         ← TourStep / TourDefinition / TourState 타입
  tourRegistry.ts      ← TOURS 맵 (SSOT for all tour copy & steps)
  tourPersistence.ts   ← loadTourState / saveTourState (DB + localStorage)
  tourUtils.ts         ← findTourTarget, measureTarget, waitForTourTarget, ensureTargetVisible

src/components/tour/
  TourProvider.tsx     ← Context provider + controller. Root-mounted.
  TourOverlay.tsx      ← Backdrop(SVG spotlight mask) + halo + popover + arrow + controls + step dots
  TourTrigger.tsx      ← 페이지에서 <TourTrigger tourId=... /> 1회 장착하면 auto-start 요청
  TourHelpButton.tsx   ← "가이드 보기" 수동 재진입 어포던스
  index.ts             ← barrel export

supabase/migrations/
  20260426000000_user_tour_state.sql  ← user_tour_state 테이블 + RLS
```

**TourProvider**는 `RootLayout`에서 `ActingAsProvider` 하위에 1회 mount. 컨텍스트는 `requestAutoStart(tourId)` / `startTour(tourId)` API만 노출. 실제 auto-start 로직은 provider 내부에서 처리하며, 이미 평가한 `(tourId@version)`은 ref로 memoize하여 이중 진입 차단.

**진입 플로우**:
1. 페이지에 `<TourTrigger tourId={...} />` 배치.
2. Provider가 `loadTourState(tourId)` 호출 — 로컬 → DB 순(없으면 null).
3. `status === 'not_seen'` 또는 `stored.version < current.version` 이면 auto-start.
4. 400ms 디퍼 후 `enterTour()`가 `requiredAnchors` 프레젠스 체크 → `guard()` → 개별 앵커 `waitForTourTarget(400ms)` 로 resolvedSteps 계산.
5. 빈 배열이면 조용히 취소(로딩 skeleton 위에 투어가 뜨는 사고 방지).

**스포트라이트 렌더**:
- Backdrop는 full-screen SVG. `<mask>`에 black 라운드 rect(padding 10px, radius 14px)로 target 영역을 뚫어 natural cutout.
- 추가로 흰색 halo ring + soft shadow로 target을 "살짝 들어올린" 인상.
- Popover는 portal 렌더, 기본 placement는 step에서 선언하되 viewport clamp + `pickPlacement()`로 실패 시 공간이 가장 큰 방향으로 swap.
- Arrow는 placement 반대 방향에 rotate-45 square로 ring과 배경을 그대로 연결.

**접근성**:
- Popover에 `role="dialog" aria-modal="true" aria-labelledby="tour-title"`.
- 스텝 변경 시 primary CTA로 초기 포커스 이동(80ms 디퍼).
- `Esc` → skip, `←/→` → prev/next.
- 모든 컨트롤은 키보드로 조작 가능.

### 영속화

- 테이블 `public.user_tour_state`: `(user_id, tour_id)` PK, `version int`, `status in ('not_seen','in_progress','completed','skipped')`, `last_step int`, `updated_at`.
- RLS: SELECT/INSERT/UPDATE/DELETE 모두 `auth.uid() = user_id`.
- `tourPersistence.ts`가 DB write를 best-effort로 수행 — 실패해도 throw하지 않음. 동일 값이 localStorage에 미러링되어 같은 기기에서는 재방문 즉시 반영.
- 로그아웃/anonymous 유저도 localStorage만으로 once-only 동작 유지.

### 투어 카탈로그 v1

| Tour id | 페이지 | 스텝 | 핵심 목적 |
|---|---|---|---|
| `studio.main` | `/my` | 8 | Studio hero / Next steps / Operating grid / Workshop / Boards / Exhibitions / Public works (탭 줄) / Portfolio tabs (동일 탭 줄) |
| `upload.main` | `/upload/*` | 5 | Tabs 개요 / Single / Bulk / Exhibition post / Intent 선택 |
| `exhibition.create` | `/my/exhibitions/new` | 4 | Post purpose / Dates / Status / Curator·Host |
| `people.main` | `/people` | 4 | Search / Discovery lanes / Role filters / Card actions |
| `delegation.main` | `/my/delegations` | 4 | What delegation is / Invite / Received / Sent |
| `network.main` | `/my/network` | 3 | Tabs / Search·Sort / List |

각 스텝의 실제 카피는 `messages.ts`의 `tour.*` 키(KR/EN)로 관리.

### 신규 data-tour 앵커

| Anchor | 위치 |
|---|---|
| `studio-hero` | `StudioHeroPanel` (기존) |
| `studio-next-steps` | `StudioNextStepsRail` (기존) |
| `studio-operating-grid` / `studio-card-*` | `StudioOperationGrid` (기존) |
| `studio-public-works` | `/my/page.tsx` 헬퍼 카드(투어 타깃 아님, 앵커 보존) |
| `studio-portfolio-tab-strip` | `StudioPortfolioPanel.tsx` 탭 줄 전용(`↕`·`⚙` 포함) |
| `upload-tabs` | `upload/layout.tsx` nav |
| `upload-tab-single` / `upload-tab-bulk` / `upload-tab-exhibition` | 각 탭 `<Link>` |
| `upload-intent-selector` | `/upload` intent step wrapper |
| `exhibition-form-title` / `exhibition-form-dates` / `exhibition-form-status` / `exhibition-form-curator` | `/my/exhibitions/new` form fields |
| `people-search` / `people-lane-tabs` / `people-role-filters` / `people-card-actions` | `PeopleClient.tsx` (card-actions는 첫 번째 visible card에만) |
| `delegation-header` / `delegation-invite` / `delegation-received` / `delegation-sent` | `/my/delegations` 섹션들 |
| `network-tabs` / `network-search` / `network-sort` / `network-list` | `/my/network` (기존) |

누락되거나 조건부로 사라지는 앵커는 프레임워크가 silently skip.

### 분석(best-effort)

`logBetaEvent`에 5개 이벤트 확장: `tour_shown`, `tour_step_advanced`, `tour_skipped`, `tour_completed`, `tour_reopened`. `beta_analytics_events` 테이블에 payload(`tourId`, `version`, `stepIndex`)와 함께 기록. 실패해도 UI는 영향 없음.

### 새 투어를 추가하는 법

1. `src/lib/tours/tourRegistry.ts`의 `TOUR_IDS` + `TOURS`에 항목 추가. `version: 1`, `steps[]`에 각 step `{ id, target, titleKey, bodyKey, placement }`.
2. `messages.ts`에 `tour.<newId>.*` 키 KR/EN 동시에 추가.
3. 대상 페이지에 `<TourTrigger tourId={TOUR_IDS.newId} />` 1회 배치.
4. 제목 옆에 `<TourHelpButton tourId={TOUR_IDS.newId} />` 배치(선택, 수동 재진입용).
5. 타깃 엘리먼트에 `data-tour="..."` 부여. 대부분은 이미 레이아웃 수준에서 존재.

### 투어 버전 bump이 필요한 경우

- 스텝을 추가/제거/재정렬
- 앵커 이름을 바꿔야 하는 UI 리팩터
- 카피를 유저에게 다시 상기시켜야 하는 의미 변경(라벨 명칭 교체 등)

bump: `tourRegistry.ts`에서 해당 tour의 `version` 을 +1. 다른 투어 상태는 영향 없음.

### 수동 적용 필요

- Supabase SQL editor에서 `supabase/migrations/20260426000000_user_tour_state.sql` 실행. 실패해도 client는 localStorage로 작동하지만 cross-device persistence를 위해 적용 필요.

### QA 체크리스트

Framework:
- [ ] /my 첫 진입 시 studio 투어 자동 실행.
- [ ] Skip 후 재방문하면 자동 실행되지 않음.
- [ ] "가이드 보기" 버튼으로 수동 재진입 가능.
- [ ] 스텝 Next/Prev/Skip/Done 모두 동작.
- [ ] Esc/←/→ 키보드 네비게이션.
- [ ] 오버레이가 모달 위로 올라감(z-[1200]).
- [ ] 모바일 뷰포트에서 popover clipping 없음.
- [ ] 타깃이 스크롤 밖이면 부드럽게 스크롤 인.
- [ ] Target 누락 시 step이 건너뛰어짐, 전체 누락 시 투어 미실행(로그 없음).

Per-tour:
- [ ] `/my` studio: 7 steps, 워크숍·보드·전시 카드 하이라이트.
- [ ] `/upload`: tabs 설명 후 single/bulk/exhibition 각각 하이라이트, 마지막 intent 셀렉터.
- [ ] `/upload/bulk` 또는 `/upload/exhibition`에서는 intent 스텝 auto-skip (anchor 부재).
- [ ] `/my/exhibitions/new`: 4 steps(title/dates/status/curator).
- [ ] `/people`: search, lane tabs, role filters, first card actions.
- [ ] `/my/delegations`: header, invite, received, sent.
- [ ] `/my/network`: tabs, search, list.

Cross-locale:
- [ ] KR 유저 카피 자연스러움.
- [ ] EN 유저 카피 자연스러움.

### 기존 기능 회귀 방지

- 기존 `data-tour` 앵커 이름 변경 없음.
- `TourProvider`는 context 미사용 시 no-op fallback 반환(비-오덴트 페이지 안전).
- localStorage만으로도 작동하므로 DB 마이그레이션 지연 시에도 회귀 없음.
- `beta_analytics_events` insert 실패는 swallow되므로 기존 event 체인에 영향 없음.

### 알려진 트레이드오프

- Provider가 `ActingAsProvider` 하위에 있어 acting-as 모드에서도 투어가 뜰 수 있음(정책: 앵커가 있는 한 괜찮다고 판단). 원치 않을 경우 `TourTrigger` 를 `!actingAsProfileId` 가드와 함께 배치(`/my` 에서 이미 적용).
- 같은 기기에서 여러 계정을 쓰면 localStorage가 account-less key라 한쪽이 다른 쪽의 투어를 먹일 수 있음. 로그인 유저에게는 DB가 source of truth 이므로 재로그인 후 재평가됨.

---

## 2026-04-25 — Studio Counter Fixes + Messaging Feature Activation

### 왜 필요했나

직전 Studio/Network 패치 리뷰에서 네 가지 후속 이슈가 나왔다.
1. 헤더의 `My Profile/내 프로필` 라벨이 실제 목적지(`/my`의 스튜디오 대시보드)와 어긋남.
2. `네트워크` 타일이 팔로워 카운트만 보여줌 — 목적지 페이지가 팔로워+팔로잉을 모두 다루는데 단일 숫자라 오해.
3. `작업실` 타일 숫자(`artworks.length` = 내 공개 작품 + claims 테이블에서 내가 `subject_profile_id`로 오른 공개 작품 최대 50건)가 `/my/library`(=`artist_id = me` 전체, visibility=all)와 불일치.
4. `connection_messages` 스키마는 있지만 UI 진입점이 `/people`의 Follow-with-Intro 한 곳뿐이었고, 받은 메시지에 회신할 수도 없었음. 가격 문의(`/my/inquiries`)와 별개 inbox로 분리되어 사용자에겐 두 개의 inbox가 존재.

### 스튜디오 카운터 / 헤더 통일

- **`nav.myProfile` 리라벨**: `My Profile → My Studio`, `내 프로필 → 내 스튜디오`. i18n 키 하나만 바꿔서 헤더(데스크톱/모바일) + 모든 하위 페이지 back link 11곳 + `artworkBack` 브레드크럼이 일관되게 반영됨.
- **네트워크 타일 composite**: `valueLabel: "${followers} · ${following}"` 형식. 서브타이틀("팔로워와 팔로잉")이 이미 순서를 설명하므로 추가 레이블 없이 자명. `stats.followingCount` 의존성 추가.
- **작업실 타일 소스 교체**: `artworks.length` → `stats?.artworksCount ?? 0`. `stats.artworksCount`는 `artist_id = me`의 **모든 visibility** 카운트라서 `/my/library`(기본 `visibility="all"`) 뷰와 항상 일치.

### 메시지 기능 정식 활성화 (Q4)

`connection_messages` 표를 1:1 inbox에서 **양방향 대화 스레드 + 어디서나 보낼 수 있는 Compose**로 승격.

#### DB 마이그레이션 `20260425000000_connection_message_threads.sql`

- `public.connection_messages.participant_key` — `text generated always as (least(...)||':'||greatest(...)) stored`. 보내는/받는 방향을 단일 key로 canonical화.
- Index `idx_connection_messages_participant_created on (participant_key, created_at desc)`로 스레드 페이지네이션을 O(N)으로.
- RPC `list_connection_conversations(limit_count, before_ts)` — 호출자 기준 thread 당 1행(`participant_key`, `other_user_id`, last preview, `last_is_from_me`, `unread_count`). `before_ts` cursor는 방금 본 페이지에서 가장 오래된 `last_created_at`을 전달.

RLS는 기존 그대로(`connection_messages_select_own` 이 sender OR recipient 둘 다 허용). **팔로우는 DB-level 요구 사항이 아님** — 모든 로그인 유저는 다른 유저에게 메시지를 보낼 수 있고, 쿼터는 이미 `social.connection_unlimited` feature key가 `planMatrix`/`seed_plan_matrix`에 정의되어 있어 BETA_ALL_PAID를 내리는 시점에 자동 적용.

#### 클라이언트 (`src/lib/supabase/connectionMessages.ts`)

기존 API(`sendConnectionMessage`, `listMyReceivedMessages`, `markConnectionMessageRead`, `getUnreadConnectionMessageCount`)는 back-compat로 유지. 신규:
- `type ConversationSummary`
- `listMyConversations({ limit, beforeTs })` — RPC 호출 → `profiles` 단일 `in("id",…)`로 peer 프로필 하이드레이션.
- `listConversationWith(otherUserId, { limit, beforeTs })` — `participant_key` eq 기반 쿼리, oldest-first 반환(채팅 버블용).
- `markConversationRead(otherUserId)` — 특정 peer로부터 받은 미읽음 메시지 일괄 읽음 처리.

#### 신규 페이지/컴포넌트

- `src/app/my/messages/page.tsx` — 기존 받은 메시지 리스트 → **대화 리스트**로 리팩터링. Preview, unread badge, "나:" prefix (내가 보낸 마지막이면), 시간, Load more 커서.
- `src/app/my/messages/[peer]/page.tsx` — 신규 **스레드 디테일**. `peer`는 username(pretty) 또는 uuid(placeholder 계정 fallback). 채팅 버블 + 날짜 divider + 이전 메시지 페이지네이션 + 인라인 회신 composer. 진입 시 `markConversationRead(peerId)`로 자동 읽음 처리.
- `src/components/connection/MessageComposer.tsx` — 공용 composer. textarea + 문자수 카운트(4000) + `useFeatureAccess("social.connection_unlimited")`로 **사용량 hint / near_limit 경고 / soft block**. ⌘/Ctrl+Enter 전송. `sendConnectionMessage` 경유하므로 metering (`connection.message_sent` usage event) 유지.
- `src/components/connection/MessageRecipientButton.tsx` — `ProfileActions`에서 사용하는 "메시지" 버튼 + portal sheet. 내부 composer에 `autoFocus`, 전송 성공 시 1.4s confirm toast 후 자동 닫힘.
- `src/components/ProfileActions.tsx` — FollowButton 옆에 `MessageRecipientButton` 나란히. 자기 자신 프로필에서는 여전히 렌더 안 함.

#### Entitlement / Metering 통합

- Composer는 `useFeatureAccess("social.connection_unlimited")`로 실시간 quota 조회. 기존 `seed_plan_matrix.sql`의 rule(free 월 5건, artist_pro/discovery_pro 월 100건, hybrid_pro 월 300건, gallery_workspace unlimited)을 그대로 사용. BETA_ALL_PAID가 켜진 현재는 `allowed=true`로 override되지만 usage_events는 계속 쌓이므로 post-beta 전환 즉시 차단이 동작.
- 전송 후 `refresh()`로 quota 재해석 → UI가 최신 `used`를 반영.

#### 알림/기존 트리거

`on_connection_message_notify` 트리거와 `notify_on_connection_message()` 함수는 그대로. 스레드에서 회신하더라도 동일한 `connection_message` 타입 알림이 상대에게 전송됨.

#### i18n 키(KR/EN) 추가

- `connection.inbox.subtitleThreads`, `connection.inbox.emptyHint`, `connection.inbox.findPeople`, `connection.inbox.unknownUser`, `connection.inbox.youLabel`
- `connection.thread.*` (backToInbox / notFound / empty / loadOlder / viewProfile)
- `connection.composer.*` (ctaMessage / sheetTitle / placeholder / placeholderTo / send / sent / usageUnlimited / usageLimited / nearLimit / blocked)
- `nav.myProfile` 값 갱신(영문/한글).

#### 영향 / 리그레션 체크

- `/my/messages` 기존 진입점 URL 동일, subtitle만 교체. 기존 signal badge(`getUnreadConnectionMessageCount`)는 건드리지 않음 — 인바운드 미읽음은 스레드 탐색 시 `markConversationRead`로 해소.
- `IntroMessageAssist`(/people)는 수정 안 됨 — 기존 Follow-with-Intro 경로 보존.
- `price_inquiries` inbox(`/my/inquiries`)는 이번 패치 범위 외. 별도 스키마/pipeline 유지.
- `FollowProfileRow`는 이번 패치에서 변경 없음(직전 Network 패치에서 `followed_at` 추가한 상태 그대로).

#### 수동 QA 체크리스트

1. `/u/<peer>`에서 "메시지" 클릭 → sheet 열림 → 보내기 → `/my/messages`에 대화 나타남.
2. `/my/messages` 에서 대화 카드 클릭 → `/my/messages/<peer>`로 이동, 미읽음 뱃지 사라짐, 채팅 버블이 오래된 → 최신 순으로 정렬.
3. 상대가 답장하면 동일 thread에 append (새로고침 후). 답장 UI의 ⌘+Enter가 전송.
4. 쿼터 hint: 무료 플랜 시드에서 5건 초과시 `blocked` 배지 렌더 (BETA_ALL_PAID OFF 필요).
5. 헤더 "내 스튜디오 / My Studio" 표기, 각 `← 내 스튜디오로/Back to My Studio` 동작.
6. 스튜디오 작업실 타일 = `/my/library` 총 카운트 일치, 네트워크 타일 = `9 · 12` composite.

### Supabase 적용 필요

- `supabase/migrations/20260425000000_connection_message_threads.sql` 수동 실행 필요.

### 환경 변수

변경 없음.

### Verified

- `npx tsc --noEmit` 통과.
- `npm run lint`에서 새로 건드린 파일 관련 에러 없음(기존 파일의 pre-existing 경고/오류는 무시).

### 변경 파일

- Added: `supabase/migrations/20260425000000_connection_message_threads.sql`
- Added: `src/app/my/messages/[peer]/page.tsx`
- Added: `src/components/connection/MessageComposer.tsx`
- Added: `src/components/connection/MessageRecipientButton.tsx`
- Modified: `src/app/my/messages/page.tsx`
- Modified: `src/components/ProfileActions.tsx`
- Modified: `src/lib/supabase/connectionMessages.ts`
- Modified: `src/lib/i18n/messages.ts`
- Modified: `src/components/Header.tsx` (주석 통일)
- Modified: `src/app/my/page.tsx` (네트워크/작업실 타일 소스 교체)

---

## 2026-04-24 — Studio/Profile UX Reset + Network Page Upgrade

### 왜 필요했나

`/my`가 계정 페이지에서 "스튜디오 대시보드"로 격상되면서, 기존 구조는 패시브 정보(7일 조회수/팔로워 카운트/미처리 문의 카운트의 큰 카드 행)가 최상단을 차지하고, `다음에 할 일`이 너무 컸으며, 8개에 가까운 비슷한 중량의 액션이 경쟁하고 있었다. 네트워크 버튼도 단순 `/my/followers` 목록으로만 연결되어 관계 관리 용도로 부족했다.

이번 패치는 (가이드 투어 패치 이전에) **IA와 dashboard UX를 먼저 안정화**하고, **`네트워크` destination을 진짜 관계 관리 페이지로 격상**한다. 패치 Brief: `Abstract_Patch_Brief_Studio_Profile_UX_Reset_Plus_Network_2026-04-23.md`.

### 스튜디오(/my) 레이아웃 변경

Before → After:

| Before | After |
|---|---|
| `StudioHero`(풀 폭) → `StudioSignals`(4칸 패시브 stat 로우) → `StudioNextActions`(풀 폭) → `StudioSectionNav`(7칸 혼합 그리드) → `StudioQuickActions` → `StudioViewsInsights`(프로필 조회 로우) | `StudioHeroPanel`(Hero + 우측 `StudioNextStepsRail` 사이드레일) → `StudioOperationGrid`(2×4 8타일) → `StudioQuickActions`(컴팩트 유지) |

변경 요약:
- 큰 passive stat 로우 제거. 각 카운트는 8타일 중 해당 타일로 흡수. 프로필 조회는 "프로필 조회" 타일로 흡수(entitlement locked 시 `—` 표시 + 점선 보더).
- `StudioNextActions`(풀 폭)는 제거하고, 동일한 `computeStudioNextActions` priority engine 결과를 `StudioNextStepsRail`이 읽어 Hero 옆 사이드레일로 렌더. 데스크톱 `lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]`로 나란히, 그 이하 뷰포트는 자연스럽게 스택.
- 타일 그룹핑(Brief §4.4 엄수):
  - Row 1 (창작/큐레이션/운영): `전시 · 작업실 · 보드 · 메시지`
  - Row 2 (관계/요청/검증/가시성): `문의 · 소유권 · 네트워크 · 프로필 조회`
- `/my/page.tsx` 폭 `max-w-4xl` → `max-w-5xl` (사이드레일 수용).
- `StudioIntelligenceSurface`는 그대로 포트폴리오 하단에 시각적으로 demote된 상태 유지.

### 신규 컴포넌트

- `src/components/studio/StudioHeroPanel.tsx` — 히어로 + 사이드레일 그리드 래퍼. `data-tour="studio-hero"`.
- `src/components/studio/StudioNextStepsRail.tsx` — 우측 컴팩트 모듈(2–4 items). `data-tour="studio-next-steps"`.
- `src/components/studio/StudioOperationGrid.tsx` — 8타일(2×4) 그리드. `data-tour="studio-operating-grid"` + 타일별 `data-tour="studio-card-*"`.
- `StudioHero`는 자체 `mb-6` 제거, 폼 팔로워/팔로잉 링크를 `/my/network?tab=followers|following`로 이관. `suppress-*` 기타 prop 변경 없음.

기존 `StudioSignals`, `StudioSectionNav`, `StudioViewsInsights`, `StudioNextActions`는 **barrel에서 여전히 export**하되 신규 페이지에서는 사용하지 않는다. 호환/복원 용도로 남김.

### 네트워크 페이지 신설

- 신규 라우트 `src/app/my/network/page.tsx`.
- 탭(URL `?tab=followers|following`으로 동기화 — deep link + shallow `router.replace`), 검색(이름/핸들/bio), 정렬(`최신순` / `이름순`).
- `lib/supabase/follows.ts` `getMyFollowers` / `getMyFollowing` 반환값에 `followed_at` 추가(follow row `created_at`). `FollowProfileRow.followed_at?: string | null`. 기존 호출부(`/my/followers`, `/my/following`, `connectionMessages.sender`)는 optional 필드라 breaking change 없음.
- 정렬 "최신순" = `followed_at desc` (값 없으면 이름순 fallback). 이름순 = `localeCompare`.
- 각 로우: 아바타 / 이름 / `@handle` · bio 한 줄 / `FollowButton`. Row 클릭 시 공개 프로필로 이동(`/u/:username`).
- 빈 상태 3종: no followers / no following / no search result.
- `data-tour="network-tabs" | "network-search" | "network-sort" | "network-list"`.
- 기존 `/my/followers`, `/my/following` 페이지는 **백워드 컴팩트용으로 그대로 남김**(알림/북마크 링크 보호). Hero/OperationGrid의 링크는 모두 `/my/network`로 갱신.

### i18n

신규 키(KR/EN 양쪽): `studio.nextSteps.title|empty`, `studio.operationGrid.title`, `studio.sections.views|viewsDesc`, `network.*` 전체 블록.

### data-tour 앵커 (후속 가이드 투어 패치용 안정 셀렉터)

- `studio-hero`, `studio-next-steps`, `studio-operating-grid`
- `studio-card-exhibitions`, `studio-card-workshop`, `studio-card-boards`, `studio-card-messages`
- `studio-public-works`
- `studio-portfolio-tab-strip` (스튜디오 투어 7·8단계 — 탭 줄만)
- `network-tabs`, `network-search`, `network-sort`, `network-list`

### 데이터/엔티타이틀먼트 영향도

- `insights.profile_viewer_identity` 해석 로직과 entitlement 호출 경로 유지. 단, `/my`에서 viewer 리스트를 더 이상 상단에 펼치지 않으므로 `getProfileViewers` 호출이 제거되어 해당 경로의 RLS 히트가 소폭 감소.
- `getMyStats`, `getProfileViewsCount`, `getBoardSaveSignals`, `getMyPriceInquiryCount`, `getMyPendingClaimsCount`, `getUnreadConnectionMessageCount` 호출은 그대로. 이들이 반환한 값은 모두 8타일에 분배되어 소비된다.
- 액팅 모드(`actingAsProfileId`)일 때는 타일/쾌속작업이 non-owner context이므로 기존 논리대로 히든 유지(변화 없음).

### 회귀 체크 (이미 수행)

- `tsc --noEmit` 통과.
- 수정 파일에 한해 `eslint` 통과(프로젝트 기존 pre-existing 오류는 이번 스코프 외).
- 팔로워/팔로잉 기존 라우트(/my/followers, /my/following) 유지 → 기존 알림 CTA 깨짐 없음.
- `connectionMessages.sender` 타입 호환(optional followed_at).

### 알려진 잔여 아이템 / 후속 과제

- `/my/followers`, `/my/following`는 장기적으로 `/my/network?tab=...`으로 redirect 처리 가능(이번 스코프 외). 즉시 제거 시 기존 알림 링크가 404가 될 수 있어 유지.
- `프로필 조회` 타일은 `/settings`로 라우팅(방문자 전체 보기가 거기 있음). 추후 전용 `/my/views` 페이지로 승격 가능.
- 네트워크 "관련순"은 **구현하지 않음**. 랭킹 데이터 없음(Brief §5 D에 명시된 지침 그대로). 현재 정렬은 `최신순`/`이름순` 2종.

### 터치한 파일

- `src/app/my/page.tsx` — 재구성.
- `src/app/my/network/page.tsx` — **신설**.
- `src/components/studio/StudioHero.tsx` — mb 제거, 링크 재타깃.
- `src/components/studio/StudioHeroPanel.tsx` — **신설**.
- `src/components/studio/StudioNextStepsRail.tsx` — **신설**.
- `src/components/studio/StudioOperationGrid.tsx` — **신설**.
- `src/components/studio/index.ts` — 신규 export 추가.
- `src/lib/supabase/follows.ts` — `followed_at` 부착.
- `src/lib/i18n/messages.ts` — `studio.nextSteps.*`, `studio.operationGrid.*`, `studio.sections.views*`, `network.*` KR/EN 추가.

---

## 2026-04-24 — Monetization Readiness Spine Patch

### 왜 필요했나

앞선 2026-04-23 패치에서 `BETA_ALL_PAID` 플래그 + `SEE_BOARD_SAVER_IDENTITY` 등 소수의 feature key만 박아 두었는데, 유료화 로드맵이 12개월에 걸쳐 5개 플랜(`free` / `artist_pro` / `discovery_pro` / `hybrid_pro` / `gallery_workspace`)으로 확장되면 다음이 반드시 필요해진다:

1. **Entitlement SSOT** — 기능 키·플랜 매트릭스를 TS와 DB 양쪽에서 동일하게 참조.
2. **Metering foundation** — 플랜 전환 시점에 quota 계산이 가능한 단일 usage 테이블.
3. **Delegation audit** — seat-based billing을 위해 "누가 누구를 대신해 무엇을 했는지" 추적.
4. **Workspace 도메인 준비** — 기관(갤러리) 시트 개념의 DB/이름 공간을 미리 박아 두고 UI는 추후.

Paywall 자체, Stripe 연동, Pricing 페이지는 **의도적으로 이번 범위에서 제외**. 이번 패치는 "언제든 paywall을 세울 수 있는 뼈대"만 완성한다.

### 핵심 모듈

- `src/lib/entitlements/` — SSOT.
  - `featureKeys.ts` — 모든 canonical feature 키(33개). 레거시 4개는 `LEGACY_FEATURE_KEY_ALIAS`로 호환.
  - `planMatrix.ts` — `PLAN_FEATURE_MATRIX`(feature → plans[])와 `PLAN_QUOTA_MATRIX`(feature → plan → quota rule).
  - `betaOverrides.ts` — `BETA_ALL_PAID=true` 플래그 이관. Beta 기간엔 `applyBetaOverride`가 모든 거부 결정을 `source=beta_override / uiState=beta_granted`으로 변환하되 **quota 계산은 그림자로 수행**. Beta 해제 시점 `false` 플립만 하면 실제 plan gating이 즉시 켜진다.
  - `quotaHelpers.ts` — `fetchUsageForFeature`, `computeQuotaInfo` 유틸.
  - `resolveEntitlement.ts` — `resolveEntitlementFor({featureKey, userId, actingAsOwnerUserId, workspaceId})`. acting-as/workspace plan 합성 + quota 체크를 한 함수로. 30초 TTL 캐시로 핫패스 보호.
  - `legacy.ts` — 기존 `getMyEntitlements`/`hasFeature` 시그니처를 유지하되 내부적으로 새 resolver로 dispatch. 기존 call site는 점진 이관.
  - `index.ts` — 배럴.
- `src/lib/metering/` — usage 기록.
  - `usageKeys.ts` — 모든 event_key 상수(`ai.*.generated`, `board.created`, `connection.message_sent`, `feature.impression`, `feature.gate_blocked`, `delegation.acting_as_entered` 등).
  - `recordUsageEvent.ts` — 단일 엔트리. 실패는 silent. Optional dual-write → `beta_analytics_events`로 기존 대시보드 호환.
  - `aggregates.ts` — window aggregation 헬퍼.
- `src/lib/delegation/actingContext.ts` — `acting_context_events` 기록 + `logActingScopeChange` 헬퍼.
- `src/hooks/useFeatureAccess.ts` — 클라이언트 훅. `actingAsProfileId` 변화에 자동 재해결.
- `src/components/monetization/FeatureBadge.tsx`, `UpgradeHint.tsx` — paywall hint UI 프리미티브(beta 중엔 자동으로 렌더 스킵).

### DB 마이그레이션 (7개, 타임스탬프 `20260423120000`~`20260423123000`)

| 파일 | 내용 |
|---|---|
| `20260423120000_plans_and_plan_matrix.sql` | `public.plans`, `public.plan_feature_matrix`, `public.plan_quota_matrix` 테이블. RLS read-all. |
| `20260423120500_entitlements_status_upgrade.sql` | `entitlements`에 `plan_source`, `trial_ends_at` 컬럼 + `status` CHECK 확장. |
| `20260423121000_usage_events.sql` | `public.usage_events` (user_id, workspace_id, feature_key, event_key, value_int, metadata). 본인/서비스롤 insert + 본인 select RLS. |
| `20260423121500_acting_context_events.sql` | append-only 감사 로그. actor는 본인 insert, subject는 자신이 당한 기록 select 가능. |
| `20260423122000_workspaces.sql` | `workspaces`, `workspace_members`, `workspace_invites`. `SECURITY DEFINER` 멤버십 헬퍼 + RLS. |
| `20260423122500_entitlement_decisions_log.sql` | 샘플링된 `entitlement_decisions`. 본인/서비스롤 scope. |
| `20260423123000_seed_plan_matrix.sql` | 위 TS 매트릭스와 1:1 mirror. idempotent upsert. |

### 배선이 들어간 기존 코드

- `src/lib/ai/route.ts` `handleAiRoute` — 인증 후 soft-cap 직전에 `resolveEntitlementFor`. 차단 시 `feature.gate_blocked` 기록 + 402/429 `degraded`. 허용 성공 시 `ai.*.generated` meter.
- `src/lib/supabase/shortlists.ts` — `createShortlist` → `board.created`, `addArtwork/ExhibitionToShortlist` → `board.saved_artwork|exhibition`.
- `src/lib/supabase/connectionMessages.ts` `sendConnectionMessage` → `connection.message_sent`.
- `src/lib/supabase/artworks.ts` `createDraftArtwork` → `artwork.uploaded` + acting-as면 `artwork.create_draft` 감사 로그.
- `src/lib/supabase/exhibitions.ts` `createExhibition` → `exhibition.created` + acting-as 감사.
- `src/lib/supabase/priceInquiries.ts` `replyToPriceInquiry` → `inquiry.replied` + acting-as 감사.
- `src/context/ActingAsContext.tsx` — `setActingAs` / `clearActingAs`에서 `delegation.acting_as_entered|exited` meter.
- `src/app/my/page.tsx`, `src/app/notifications/page.tsx` — 기존 `hasFeature(...)` 호출을 `resolveEntitlementFor`(page)과 `useFeatureAccess`(notifications)로 이관. 외부 문구·UX는 그대로.

### 진단 페이지

- `/dev/entitlements` — 개발 모드 또는 `NEXT_PUBLIC_ENTITLEMENTS_DIAG=1`일 때 활성. 모든 `FEATURE_KEYS`에 대해 `resolveEntitlementFor` 결과를 테이블로 표시(plan/source/uiState/quota/hint). acting-as 컨텍스트 영향도 함께 확인 가능.
- `/dev/ai-metrics` — 기존 AI 루틴 요약에 더해 `usage_events` 30일 집계 섹션 추가.

### 유료화 플립 체크리스트

1. `BETA_ALL_PAID=false`로 전환.
2. `plans` / `plan_feature_matrix` / `plan_quota_matrix` 를 최신 매트릭스로 재seed(또는 Stripe webhook이 자동 upsert).
3. 기존 유저에게 기본 `free` 플랜 행을 `entitlements`에 insert(또는 trial 자동 부여).
4. Stripe checkout / portal 연결. 결제 성공 시 `entitlements.status='active', plan_source='stripe', plan=...` upsert.
5. Workspace 도메인 front-end 착수(invite/member/billing 페이지).
6. `UpgradeHint` 실제 CTA 문구 및 전환 deeplink 작성.

추가 유료화 제안 15+건은 [docs/MONETIZATION_PROPOSALS.md](docs/MONETIZATION_PROPOSALS.md) 참조. 그 중 Group A는 이번 스파인 패치로 이미 meter/enforcement까지 준비 완료.

---

## 2026-04-23 — 보드 담기 알림 + 아티스트 시그널 + 프리미엄 레이어

### 왜 필요했나

아티스트 입장에서 누군가 자기 작품을 보드에 담는 행위는, 특히 신진이고 대외 인지도가 낮을수록 강한 관심 시그널이다. 이걸 아무 피드백 없이 누락시키는 건 제품 취지와 안 맞음. 동시에 큐레이터의 스카우팅 프라이버시도 보호해야 하므로, 노출 깊이를 플랜으로 게이팅하는 구조를 도입.

### DB 변경 — `supabase/migrations/20260423100000_board_save_notifications.sql`

- `notifications_type_check` CHECK 제약 확장: `board_save`, `board_public` 추가.
- 트리거 `on_board_save_notify` — `shortlist_items` INSERT 시 작품의 `artist_id`에게 알림.
  - Self-save 스킵 (작가 == 보드 오너).
  - 같은 `(artist, actor, artwork)` 조합이 7일 내 이미 알림을 받았다면 dedup. 큐레이터가 작품을 다른 보드로 옮기는 것만으로는 다시 알리지 않음.
  - Payload에는 `shortlist_id`, `is_private`만 담음. **보드 제목·내용은 넣지 않음** (프라이버시).
- 트리거 `on_shortlist_public_transition` — `shortlists.is_private true → false` 전환 시, 보드에 포함된 **모든 아티스트**(보드 오너 제외)에게 알림.
  - WHEN절 `(old.is_private = true and new.is_private = false)`로 실제 전환만 포착.
  - 공개된 정보이므로 Payload에 `shortlist_title`, `share_token` 노출.
  - 비공개↔공개 토글을 반복하면 전환마다 재발행(의도).
- RPC `get_board_save_signals()` — SECURITY DEFINER, 반환 `{boards_count, savers_count}`.
  - `auth.uid()`의 작품이 담긴 **고유 보드 수**와 **고유 저장자 수**만 반환.
  - `s.owner_id <> auth.uid()` 조건으로 self-curation은 카운트에서 제외.
  - 개별 보드·큐레이터 신원은 절대 노출 안 함(집계 전용).

### 프론트 변경

- `src/lib/supabase/notifications.ts` — `NotificationType`에 `board_save`, `board_public` 추가.
- `src/lib/supabase/shortlists.ts` — `getBoardSaveSignals()` RPC wrapper.
- `src/app/notifications/page.tsx` — 두 타입 렌더링 + plan 기반 문구 분기.
  - `board_save` 링크는 항상 `/artwork/{artwork_id}` (비공개 보드일 수 있으므로 보드 자체로는 링크 X).
  - `board_public` 링크는 **유료만** `/room/{token}`, 무료는 `/artwork/{artwork_id}` (큐리오시티 갭 → 업그레이드 훅).
- `src/app/my/page.tsx` — `StudioSignals`에 "내 작품이 담긴 보드 N개" 타일 (`boards_count > 0`일 때만; acting-as-gallery 중엔 숨김).
- `src/lib/i18n/messages.ts` — 한/영 문구 8개 키.

### 문구 (한국어)

| 이벤트 | 무료/기본 | 유료 |
|---|---|---|
| `board_save` | 누군가 회원님의 작품 〈{title}〉을(를) 보드에 담았어요 | {name}님이 회원님의 작품 〈{title}〉을(를) 보드에 담았어요 |
| `board_public` | 회원님의 작품 〈{title}〉이(가) 담긴 보드가 공개되었어요 | 회원님의 작품 〈{title}〉이(가) 담겨 있는 {name}님의 보드 〈{shortlistTitle}〉이(가) 공개되었어요 |

### 프리미엄 레이어 — `src/lib/entitlements.ts`

- `BETA_ALL_PAID = true` 플래그 추가. 베타 기간 동안 온보딩된 모든 유저를 유료 취급 → `hasFeature()`가 선언된 기능 전부 true 반환. 유료 런칭 시점에 `false`로 플립하면 실제 플랜 매트릭스가 즉시 적용됨.
- 신규 feature 키:
  - `SEE_BOARD_SAVER_IDENTITY` → `artist_pro` 전용. 보드 담기 알림에서 담은 사람 이름 공개.
  - `SEE_BOARD_PUBLIC_ACTOR_DETAILS` → `artist_pro` 전용. 공개 전환 알림에서 보드 주인·제목·룸 링크 공개.

### 유료화 로드맵 메모

유료 런칭 시 플립할 지점을 미리 박아둠:

- **아티스트 측 (artist_pro)**
  - `SEE_BOARD_SAVER_IDENTITY` — 누가 담았는지 보기
  - `SEE_BOARD_PUBLIC_ACTOR_DETAILS` — 공개 보드 상세 직접 링크
  - (기존) `VIEW_PROFILE_VIEWERS_LIST`, `VIEW_ARTWORK_VIEWERS_LIST` — 방문자 로그
  - 향후 후보: "내 작품이 담긴 공개 보드 전용 뷰"(`/my/featured-in`), "Collector Pulse" 집계 인사이트(최근 30일 저장자 추이 등)
- **큐레이터/콜렉터 측 (collector_pro)**
  - 후보: 보드 수 쿼터(무료 N개 초과 시 유료). `shortlists` 테이블에서 `owner_id` count만 보면 돼서 구현 간단.
  - 후보: 공유 룸 애널리틱스(조회·체류시간), 공개 보드 만료일 세팅, 공동 편집자 수 제한 해제.
- **공용 (pro 전반)**
  - 후보: AI 전시 기획 초안(`ExhibitionDraftAssist`) 사용량 상한, 프로파일 커스터마이징(도메인·테마), 향후 노출 부스트.

각 후보는 지금은 "베타 ALL_PAID"에 묻혀 보이지 않지만 `FEATURE_PLANS` 매트릭스에 등록하는 순간 무료 티어에서는 자동 차단됨. 추가 시엔 반드시 feature 키를 `FEATURE_PLANS`에 등록하고 UI 콜사이트에서 `hasFeature(plan, KEY)`로 감싸는 패턴 유지.

### 추후 작업 (별도 패치로 메모)

- **"내 작품이 담긴 공개 보드" 전용 뷰**: 현재는 알림 클릭으로만 도달. 아티스트의 `/my/shortlists` 상단 보조 섹션 혹은 `/my/featured-in` 페이지로 `board_public` 이력을 누적 표시하면 UX 연속성이 생김. 보드 오너십 의미(`내 보드`)와 혼동되지 않도록 별도 탭/섹션으로 분리 필수.
- **알림 dedup 윈도우 튜닝**: 현재 7일. 실사용 피드백 보고 1–14일 사이에서 조정.
- **`board_public` 반복 토글 스팸 가드**: 동일 보드를 하루에 5번 토글하는 큐레이터가 생기면 `OLD.is_private = TRUE AND NEW.is_private = FALSE AND 최근 24h 알림 없음`으로 강화 가능. 지금은 의도적 단순함 유지.

### 검증

- 트리거: `board_save` cross-board dedup=1, self-save=0, `board_public` 첫 전환=1, 재토글=2 (의도).
- RPC: self-curation 제외 후 `boards_count=1, savers_count=1` 확인.
- `tsc --noEmit` clean, lint clean.

---

## 2026-04-22 — Boards RLS 재귀 버그 핫픽스 + 보드 → 전시 게시물 진화 경로

### 증상

`/my/shortlists`에서 "보드 만들기"가 항상 실패하고 "보드를 만들지 못했어요…" 토스트만 떴음. 패치 이전부터 이미 깨져 있던 잠복 버그.

### 근본 원인

Supabase `postgres` 로그에서 확인:

```
ERROR: infinite recursion detected in policy for relation "shortlists"
```

두 RLS 정책이 서로 EXISTS 서브쿼리로 물려 있었음:
- `shortlists.shortlists_collab_select` → `EXISTS (SELECT FROM shortlist_collaborators …)`
- `shortlist_collaborators.shortlist_collab_owner_manage` (FOR ALL) → `EXISTS (SELECT FROM shortlists …)`

둘 다 PERMISSIVE라 SELECT 시 둘 다 OR로 평가되고 각 EXISTS가 상대 테이블의 RLS를 다시 트리거 → 재귀. Postgres가 감지해 쿼리 전체를 abort. PostgREST의 `.insert().select()` (returning=representation)도 뒤따르는 SELECT에서 같은 에러로 row를 돌려받지 못하고 클라이언트가 실패로 판정. 그래서 테이블은 비어 있고 UI는 계속 실패 토스트를 내던 상태.

(`shortlist_items` / `shortlist_views`의 owner 정책도 같은 패턴을 가지고 있었음.)

### 수정

`supabase/migrations/20260422140000_shortlists_rls_recursion_fix.sql` 추가. Supabase에 이미 적용됨(MCP `apply_migration`).

핵심: cross-table EXISTS를 `SECURITY DEFINER` 헬퍼로 치환해 RLS 평가가 상대 테이블로 재진입하지 않도록 끊음.

신규 함수 (STABLE SECURITY DEFINER, search_path=public, authenticated에게 EXECUTE 권한):

- `public.is_shortlist_owner(_sid uuid)`
- `public.is_shortlist_collaborator(_sid uuid)`
- `public.is_shortlist_editor(_sid uuid)`

재작성된 정책:

- `shortlists.shortlists_collab_select` → `USING (is_shortlist_collaborator(id))`
- `shortlist_collaborators.shortlist_collab_owner_manage` (ALL) → USING/WITH CHECK `is_shortlist_owner(shortlist_id)`
- `shortlist_items.shortlist_items_owner` (ALL) → `is_shortlist_owner(shortlist_id)`
- `shortlist_items.shortlist_items_collab_select` → `is_shortlist_collaborator(shortlist_id)`
- `shortlist_items.shortlist_items_collab_editor` (ALL) → `is_shortlist_editor(shortlist_id)`
- `shortlist_views.shortlist_views_owner_select` → `is_shortlist_owner(shortlist_id)`

SECURITY DEFINER 함수 안에서 테이블을 읽을 때는 RLS를 우회하므로 외부 정책이 함수를 호출해도 재진입이 발생하지 않음. 함수 자체는 boolean만 돌려주므로 정보 누출 위험 없음.

### 검증

- `pg_policies` 상 모든 재작성된 qual이 함수 호출 식으로 바뀜.
- 시뮬레이션: `SET LOCAL role authenticated` + JWT claims 주입해 `SELECT count(*) FROM shortlists` → 0 (에러 없음).
- INSERT ... RETURNING id, title 동일 조건에서 정상 동작 (테스트 row 삽입/삭제로 round-trip 확인).

### 보드 → 전시 게시물 진화 경로

브리프 취지("보드가 자연스럽게 전시 게시물로 진화")에 맞춰 홍보 경로를 구축:

1. **보드 상세** (`/my/shortlists/[id]`)
   - 타이틀 블록 아래에 "이 보드를 전시 게시물로 발전시키기" CTA 카드 추가.
   - 작품이 1개 이상일 때만 활성화. 비활성화 시 "작품을 최소 1개 이상 담아두면 활성화돼요." 힌트.
   - 클릭 → `/my/exhibitions/new?fromBoard=<id>` 이동 + `board_promote_started` 이벤트.

2. **전시 생성** (`/my/exhibitions/new`)
   - `fromBoard` 쿼리 감지 시 보드 타이틀로 제목 프리필(사용자가 수정한 뒤면 덮어쓰지 않음).
   - 상단 배너: "보드에서 시작: {title} · 작품 N개".
   - 생성 성공 후 `/my/exhibitions/<new-id>/add?fromBoard=<boardId>`로 이동해 상태 이월.

3. **전시에 작품 추가** (`/my/exhibitions/[id]/add`)
   - `fromBoard` 쿼리 감지 시 해당 보드의 artwork_id 목록을 프리페치.
   - "작품 선택" 단계 최상단에 요약 배너 + `보드의 작품 N개 모두 추가` 원클릭 버튼.
   - 이미 전시에 담겨 있는 작품은 스킵(중복 방지). 일부 실패 시 "부분 성공" 토스트, 전체 실패 시 재시도 안내.
   - 성공 시 `board_promote_bulk_added` 이벤트 (added, total, exhibition_id, board_id).

새 i18n 키: `boards.promote.cta|hint|disabledHint|fromBoardBanner|addAllFromBoard|adding|addedToast|partialToast|failedToast` (KO/EN).
새 Beta 이벤트: `board_promote_started`, `board_promote_bulk_added`.

보드 자체는 유지되므로 "비교/검토 공간 → 공개 게시물 승격" 흐름이 자연스럽게 이어짐. 보드 상세에서 다시 CTA를 눌러 또 다른 전시로도 확장 가능.

### Supabase SQL 적용

이미 프로덕션(`sgufonscldvdwfgzltfw`)에 MCP `apply_migration`으로 반영됨. 로컬 개발/다른 환경에서는 `supabase/migrations/20260422140000_shortlists_rls_recursion_fix.sql`을 SQL Editor에서 실행.

### 영향 파일

- `supabase/migrations/20260422140000_shortlists_rls_recursion_fix.sql` (신규)
- `src/lib/i18n/messages.ts`, `src/lib/beta/logEvent.ts`
- `src/app/my/shortlists/[id]/page.tsx`
- `src/app/my/exhibitions/new/page.tsx`, `src/app/my/exhibitions/[id]/add/page.tsx`

---

## 2026-04-22 — Workshop/Boards IA 재정비 + /my Studio UI/UX 업그레이드

두 개의 패치 브리프를 묶어 한 번에 반영:
- `Abstract_Patch_Brief_Workshop_Boards_2026-04-22.md` — 라이브러리/쇼트리스트 IA/네이밍/UX 복구
- `Abstract_UIUX_Upgrade_Patch_Brief_2026-04-22.md` — `/my`(스튜디오) 대시보드 구조·계층 정비

### 네이밍 맵 (UI 레이블만 변경, 라우트 경로는 유지)

| 기존 UI | 변경 UI (KO) | 변경 UI (EN) | 라우트 (불변) |
|---------|--------------|--------------|---------------|
| 라이브러리 | 작업실 | Workshop | `/my/library` |
| 쇼트리스트 | 보드 | Boards | `/my/shortlists` |
| 쇼트리스트에 담기 | 보드에 담기 | Save to board | `SaveToShortlistModal` |
| 새 쇼트리스트 | 새 보드 | New board | `/my/shortlists` |
| 전시 만들기 | 전시 게시물 만들기 | Create exhibition post | `/my/exhibitions/new`, `/upload/exhibition` |
| 내 프로필 | 내 스튜디오 | My studio | `/my` |

경로는 바꾸지 않음. 북마크/딥링크/앱 라우팅이 깨지지 않도록 UI 레이블만 교체. 향후 `/my/workshop`·`/my/boards`로 옮길지는 트래픽/리디렉트 계획과 함께 별도 판단.

### /my 스튜디오 구조 변경

- **페이지 타이틀**: "내 프로필" → "내 스튜디오" (+ 부제: "작품·전시·연락을 운영하는 나만의 대시보드").
- **StudioHero**: 역할 칩 아래 `팔로워 · 팔로잉` 인라인 카운트(클릭 가능) 추가.
- **StudioSignals**: 팔로워 라벨 통일(`studio.signals.followers` 사용; 델타 전용 키와 분리).
- **StudioQuickActions**: 3단 계층으로 재편
  - Primary(1): 작품 올리기
  - Secondary(2~3): 전시 게시물 만들기 · 프로필 편집 · 사람 찾기
  - Tertiary(오버플로 `더 보기`): 작업실/보드/저장된 검색/포트폴리오 정렬/프로필 완성
- **StudioSectionNav**: `grid-cols-1 sm:2 lg:4`로 변경, 카드마다 1줄 설명(`descKey`) 추가. `portfolio` 섹션 제거(상단 스튜디오 프레임으로 흡수), 대신 `workshop`·`boards` 엔트리 노출.
- **공개 작품 섹션**: 포트폴리오 패널 위에 "공개 작품 · 내부 작업은 작업실에서" helper + 작업실 링크.

### /my/exhibitions/new 프레이밍

- 타이틀: "전시 게시물 만들기" + 부제 "이미 진행했거나, 현재 진행 중이거나, 곧 진행할 전시의 정보를 정리해 공개하는 페이지를 만듭니다."
- AI 문안 도우미는 제목 입력 이후에만 등장하는 접힘 패널(`선택 사항`)로 강등. 기본은 접힘.
- `/upload/exhibition` 탭 라벨도 "전시 게시물 만들기"로 통일 (리다이렉트 경로는 동일).

### Boards (구 Shortlists) 기능 복구

- **생성 흐름**: 에러 피드백(`boards.createFailed`) + 성공 토스트(`boards.createSuccess`) + 300ms 후 상세 페이지로 라우팅.
- **목록/상세**: 모든 하드코딩 문자열을 `boards.*` 네임스페이스로 이전. 공유 링크 복사 성공 피드백 추가.
- **썸네일 버그**: `listShortlistItems`가 `artwork.image_path`를 읽도록 확장. 상세에서 `getArtworkImageUrl(image_path, "thumb")` 사용. 이미지 없는 작품에 대한 폴백 박스.
- **SaveToShortlistModal (보드에 담기)**: 완전 i18n화. 전시도 아트워크와 동일한 중복 감지/해제 지원(`getShortlistIdsForExhibition`, `removeExhibitionFromShortlist` 신규). 모달 하단 `모든 보드 보기` 링크 추가.
- **updated_at 일관성**: `addExhibitionToShortlist`도 부모 `shortlists.updated_at`을 갱신해 최근순 정렬 정합성 확보.

### i18n

- `src/lib/i18n/messages.ts`에 다음 네임스페이스 확장/추가:
  - `studio.pageTitle`, `studio.pageSubtitle`, `studio.hero.followers`, `studio.hero.following`, `studio.sections.*Desc`, `studio.quickActions.*`, `studio.portfolioHelper.*`
  - `library.*` (Workshop 레이블), `exhibition.createSubtitle`, `upload.tabExhibition` 재작성
  - `boards.*` (Boards 전체), `boards.save.*` (모달), `common.close`, `common.cancel`
  - `ai.assist.introLabel`, `ai.assist.optional`
- KO/EN 양쪽 모두 동기화.

### 의도적 연기(deferred)

- 라우트 경로 실제 이동 (`/my/library` → `/my/workshop`, `/my/shortlists` → `/my/boards`): 리디렉트·SEO·외부 공유 링크 영향 검토 후 별도 패치.
- `StudioNextActions` 비주얼 재설계: 이번 패치 범위 밖. 기존 구조 유지.
- 아트워크/전시 상세 페이지 Save 버튼 시각 재설계: 라벨만 `보드에 담기`로 통일(기능/스타일 변경 없음).

### 영향 범위 (touched files)

- `src/app/my/page.tsx`, `src/app/my/library/page.tsx`, `src/app/my/shortlists/page.tsx`, `src/app/my/shortlists/[id]/page.tsx`, `src/app/my/exhibitions/new/page.tsx`
- `src/components/studio/StudioHero.tsx`, `StudioQuickActions.tsx`, `StudioSectionNav.tsx`
- `src/components/SaveToShortlistModal.tsx`
- `src/lib/supabase/shortlists.ts` (타입/쿼리 확장 + 신규 함수)
- `src/lib/i18n/messages.ts` (KO/EN)
- `src/app/artwork/[id]/page.tsx`, `src/app/e/[id]/page.tsx` (Save 버튼 라벨만)

### 검증

- `npx tsc --noEmit` — clean.
- `npm run lint`로 변경 파일만 스코핑 — 신규 error 0, 기존 warning 1(이미지 태그, 기존 패턴).

---

## 2026-04-20 — 이메일 링크 redirect URL NEXT_PUBLIC_APP_URL 고정 + vercel.com 이동 원인 정리

### 코드 수정
- `src/lib/supabase/auth.ts`: `getAuthOrigin()` 헬퍼 추가. `signUpWithPassword`, `sendMagicLink`, `sendPasswordReset` 세 곳 모두 `window.location.origin` 대신 `NEXT_PUBLIC_APP_URL` 우선 사용. Vercel Preview URL(`henry-kims-projects-*.vercel.app`)이 이메일 링크에 박히는 문제 해결.

### Supabase 대시보드 필수 설정 (코드만으로는 안 됨)

이메일 링크가 `vercel.com`으로 가는 현상의 원인:
- Supabase는 `emailRedirectTo`로 넘긴 URL이 **Redirect URLs 허용 목록에 없으면 무시**하고 **Site URL로 폴백**함
- Vercel ↔ Supabase 자동 통합 시 Site URL이 `vercel.com` 계열로 잘못 설정되는 경우 발생

**Supabase Dashboard → Authentication → URL Configuration에서 반드시 확인:**

| 항목 | 올바른 값 |
|------|-----------|
| Site URL | `https://abstract-mvp-dxfn.vercel.app` |
| Redirect URLs | `https://abstract-mvp-dxfn.vercel.app/auth/callback` 포함 |

Redirect URLs에 없으면 `emailRedirectTo`가 무시되고 Site URL로 떨어짐 → vercel.com 이동 현상.

---

## 2026-04-20 — 온보딩 라우팅 3개 버그 수정

- **루트(`/`) 비로그인 라우팅**: 기존 `/onboarding`(가입) 대신 `/login`으로 변경. 돌아오는 기존 사용자가 가입 폼이 아닌 로그인 폼을 보게 됨. (신규 유저는 로그인 하단 "바로 시작하기" 링크로 진입)
- **AuthGate RPC 폴백**: `getMyAuthState()` RPC 일시 실패 시 기존엔 그냥 통과(→ 피드). 이제 `getMyProfile()` + 클라이언트 `isPlaceholderUsername` 으로 2차 체크, 난수 유저네임이면 `/onboarding/identity` 강제 리디렉트.
- **RandomIdBanner**: dismiss 버튼 제거, amber 배경 + 굵은 텍스트로 눈에 잘 띄는 디자인으로 변경. `role="alert"` 적용.
- Supabase SQL: `20260421120000_identity_completeness.sql` 적용 필요 (이전 패치에서 동일).

---

## 2026-04-20 — 가입 확인 이메일 링크 → /onboarding/identity 정상 라우팅

- **문제**: `signUpWithPassword`에 `emailRedirectTo`가 없어 Supabase가 대시보드 Site URL(루트 `/`)로 인증 링크를 보냄. 그 결과 이메일 링크를 누르면 `/auth/callback`을 거치지 않고 바로 피드로 떨어져, `routeByAuthState` → `/onboarding/identity` 흐름이 완전히 우회됨.
- **수정**: `src/lib/supabase/auth.ts` — `signUpWithPassword`에 `emailRedirectTo: ${origin}/auth/callback` 추가. 이제 확인 링크 클릭 → `/auth/callback` → `routeByAuthState` → `needs_identity_setup`이면 `/onboarding/identity`로 정상 이동.
- Supabase SQL 돌려야 할 것: 없음.

---

## 2026-04-20 — Login EN subtitle, completeness SSOT, upload claim copy

- **`/login` (EN)**: 서브타이틀에서 `[text-wrap:balance]`·`max-w-[32ch]` 제거, 헤더 전체 너비 사용. 두 문장은 각각 블록이지만 영어 2번째 줄이 "Enter your email and" 에서 끊기지 않고 한 줄로 읽히도록 함. KO 는 기존 좁은 measure + balance 유지.
- **프로필 완성도 불일치 (/my 67% vs 설정 92/100)**:
  - **원인 1**: Studio(`/my`) 가 `profile_completeness` DB 컬럼을 무시하고 클라이언트 재계산만 표시. 설정은 저장 시 기록된 DB 값을 우선 표시.
  - **원인 2**: `getProfileSurface` 가 설정과 달리 `profile_details.collector_price_band` / `collector_acquisition_channels` 를 읽지 않아 콜렉터 모듈 점수가 재계산에서 낮게 나옴.
  - **조치**: `resolveDisplayedProfileCompleteness()` 로 **DB 값 우선, 없으면 재계산**을 `/my`·설정 카드에 통일. `surface.ts` 에서 collector_* 레거시 키를 `price_band` / `acquisition_channels` 와 동일 우선순위로 정규화.
- **업로드 클레임 버튼 카피**: KO/EN 모두 "~만 사용/only" 톤 제거 → `내 작품 (아티스트)`, `소장 작품 (콜렉터)` 등 페르소나 꼬리표만 부드럽게 표기.

---

## 2026-04-19 — Onboarding Sign-off Hardening Patch (v2)

브랜치: 현재 작업 브랜치.

### 0. 한 줄 요약
> "온보딩 front door 베타 sign-off 전 마지막 hardening 패스. 역할/대표역할 desync 차단, 실제 routing 동작을 검증하는 runtime 스모크, 로그인 서브타이틀 polish, dev 환경 SQL 누락 감지."

### 1. Track 1 — primary-role / roles 동기화 불변식
**문제**: 기존 identity-finish 에서 `main_role` 을 지정한 뒤 같은 역할 chip 을 해제하면 `main_role ∉ roles` 상태가 생겨, 서버에 저장될 경우 탐색/검색 일관성이 깨졌음.

**해결**:
- `src/app/onboarding/identity/page.tsx`: `toggleRole()` 이 현재 `main_role` chip 의 제거를 차단. 대신 인라인 힌트(`identity.finish.primaryLockHint`) 를 표시하여 "위 메뉴에서 다른 대표 역할을 먼저 고르라" 고 안내. 제거를 허용하려면 `<select>` 에서 primary 를 다른 값으로 바꾼 뒤 해제하면 됨.
- `handleSubmit()` 제출 전 최종 방어선: `roles.includes(mainRole)` 이 false 면 저장 차단 + `identity.finish.primaryDesync` 오류 노출.
- primary chip 에 `title` 속성으로 설명 노출.

**불변식**: 저장 payload 에서 `main_role ∉ roles` 는 불가능.

### 2. Track 2 — Runtime routing 스모크 신설
기존 `tests/onboarding-smoke.mjs` 는 grep 수준 static check. Beta sign-off 에는 부족.

**추가**: `tests/onboarding-routing-runtime.mjs` — Node 24 의 `--experimental-strip-types` 로 `src/lib/identity/routing.ts` 를 직접 import 해 실제 `routeByAuthState()` 를 구동.

**시나리오 (9종)**:
1. 비밀번호 회원가입 직후 (`needs_identity_setup`) → `/onboarding/identity?next=...`
2. 매직링크 1-hop placeholder (세션 + placeholder username) → identity-finish
3. 완료 유저 → `next` 또는 `/feed`
4a. 초대 회원가입 + `next=/invites/delegation?token=abc` → identity-finish 이 `next` 보존
4b. identity 완료 후 동일 state → 원래 초대 페이지로 복귀
5. 세션 없음 → `/login` (+ `next`)
6. 세션은 있으나 RPC state=null (과거 로그인 루프 버그) → default destination, never `/login`
7. 비밀번호 미설정 계정 → `/set-password`
8. `needs_onboarding` 만 true → `/onboarding`
9. `safeNextPath` 가 `//evil.com`, `https://evil.com` 거부

**실행**: `npm run test:onboarding-runtime` (package.json 에 스크립트 추가).

### 3. Track 3 — Dev-only SQL 누락 감지
**문제**: `supabase/migrations/20260421120000_identity_completeness.sql` 이 staging/dev 에 미적용이면 `get_my_auth_state()` 가 새 컬럼 없는 구버전 스키마를 반환 → 프런트엔드는 legacy fallback 으로 내려가 "겉보기엔 멀쩡하지만 실은 gate 가 동작하지 않는" 상태가 생김.

**해결**: `src/lib/supabase/auth.ts` 의 `getMyAuthState()` 가 응답에서 `needs_identity_setup` / `is_placeholder_username` 이 누락된 것을 감지하면 `NODE_ENV !== "production"` 에서만 한 번 `console.warn` 을 띄워 어떤 마이그레이션이 필요한지 명시. Production 에서는 완전 무음.

### 4. Track 5 — 로그인 서브타이틀 polish
**문제**: `/login` 서브타이틀 "Welcome back. Enter your email and password to continue." / "돌아오신 것을 환영해요. 이메일과 비밀번호로 이어서 사용하세요." 가 좁은 viewport 에서 어색하게 2 줄로 깨져 온보딩 다른 surface 대비 품질감이 떨어짐.

**해결**:
- i18n: `login.welcomeBack` 제거 → `login.welcomeBackTitle` ("Welcome back." / "돌아오신 것을 환영해요.") + `login.welcomeBackHint` ("Enter your email and password to continue." / "이메일과 비밀번호로 이어서 사용하세요.") 로 분할.
- `src/app/login/page.tsx`: 두 문장을 각각 `<span className="block">` 으로 렌더, `max-w-[32ch]` + `[text-wrap:balance]` + `leading-relaxed` 로 의도적 2-line 블록 구성. EN/KO 둘 다 균형 있게 읽힘.

### 5. Track 4 — 경로 정리 재확인
placeholder / signed-in 유저가 다음 surface 를 통과할 때 루프 없음 재확인 (Runtime 스모크가 이를 런타임으로도 검증):
- `/` → signup-first
- `/login` → 기존 유저 전용, 완료 후 `routeByAuthState(..., { sessionPresent: true })`
- `/auth/callback` → `sessionPresent: true`
- `/onboarding` → signed-in 은 즉시 `routeByAuthState`
- `/onboarding/identity` → 완료된 state 는 gate 를 통해 우회
- `AuthGate` → RPC state=null 이면 현재 페이지 유지 (루프 방지)
- Header "My Profile" → placeholder 유저는 `/onboarding/identity`
- `/invites/delegation` → 가입 링크에 `next` 보존

### 6. i18n 세부 변경
EN+KO 양쪽:
- 제거: `login.welcomeBack`.
- 추가: `login.welcomeBackTitle`, `login.welcomeBackHint`, `identity.finish.primaryLockHint`, `identity.finish.primaryDesync`.

### 7. "벌크" → "일괄" 한국어 통일 (사용자 요청)
업로드 화면과 하부 버튼 메뉴의 "벌크" 한글 표기를 "일괄" 로 교체. 영어 문자열 (`bulk.*` 키 값 중 "Bulk") 은 손대지 않음.
- `src/lib/i18n/messages.ts`: `exhibition.uploadBulkWorks`, `exhibition.dropImagesHere` (KO), `upload.tabBulk` (KO) 에서 "벌크" → "일괄".
- `src/app/my/exhibitions/[id]/page.tsx`: 버킷 업로드 버튼 2곳 `"(벌크)"` → `"(일괄)"`.
- `src/app/my/exhibitions/[id]/add/page.tsx`: 코드 주석 한 줄 동반 교체.

### 8. Acceptance 재확인
- [x] `main_role` / `roles` 절대 desync 되지 않음 (UI + submit 가드 이중 보호).
- [x] Runtime onboarding smokes 9종 모두 pass.
- [x] Dev 환경에서 SQL 누락 즉시 감지 가능.
- [x] Placeholder 유저 경로 루프 없음.
- [x] Invite round-trip 유지.
- [x] 로그인 서브타이틀 KO/EN 의도된 2-line 블록.
- [x] `npx tsc --noEmit` 통과, 패치 대상 파일 lint-clean (기존 이슈는 범위 외).

### 9. 실행 명령
```bash
npm run test:ai-safety
npm run test:onboarding-smoke
npm run test:onboarding-runtime
npx tsc --noEmit
```

---

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
