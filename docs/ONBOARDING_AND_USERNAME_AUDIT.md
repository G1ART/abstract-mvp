# 온보딩·유저아이디(@username)·검색 감사

난수 유저아이디(user_xxx) 다발 원인과 온보딩/설정/검색 갭을 코드 기준으로 정리한 문서.

---

## 1. 현재 온보딩 UX 시퀀스 (상세)

### 1.1 매직링크 로그인 경로

| 단계 | 화면/처리 | 코드 위치 | 비고 |
|------|-----------|-----------|------|
| 1 | 로그인 페이지: 이메일 입력 후 "매직 링크 보내기" | `login/page.tsx` → `sendMagicLink(email)` | 비밀번호 없이 로그인 |
| 2 | 사용자가 이메일 링크 클릭 | Supabase Auth | `emailRedirectTo: origin + "/auth/callback"` |
| 3 | **Auth 콜백** | `auth/callback/page.tsx` | `getSession()` → `getMyProfile()` |
| 4a | 프로필 **없음** | → `router.replace("/onboarding")` | 프로필 완성 유도 |
| 4b | 프로필 **있음** | → 비밀번호 없으면 `/set-password`, 있으면 `/feed` |  |
| 5 | **온보딩 페이지 로드** | `onboarding/page.tsx` | 루트 레이아웃에 `ProfileBootstrap` 포함 |
| 6 | **ProfileBootstrap** (레이아웃) | `ProfileBootstrap.tsx` | `onAuthStateChange` / `getSession()` → `ensure_my_profile()` RPC |
| 7 | **ensure_my_profile()** | DB: `ensure_profile_row()` | **프로필 행이 없으면 INSERT** (username = `user_` + uuid 앞 8자) |
| 8 | 온보딩 useEffect | `getSession().then(getMyProfile())` | **이미 프로필이 있으면** → `router.replace("/feed")` |
| 9 | 결과 | 프로필이 7에서 생성되면 8에서 "프로필 있음"으로 판단 → **"프로필 완성" 폼을 보지 못하고 피드로 이동** | **갭: 난수 아이디로 피드 진입** |

**갭 요약 (매직링크)**  
- **프로필 행 생성 시점**: Auth 직후 **어느 페이지를 열든** 레이아웃에서 `ProfileBootstrap`이 돌면서 `ensure_my_profile()` → `ensure_profile_row()`가 호출되고, **프로필이 없으면 그 순간 `user_xxxxxxxx`로 INSERT**됨.  
- **온보딩 판단**: 온보딩 페이지는 "프로필이 있는가?"만 보므로, **이미 생성된 프로필(난수 username)이 있으면 "완료"로 간주**하고 피드로 보냄.  
- 따라서 **유저아이디/표시이름을 한 번도 입력하지 않은 사용자**가 `user_xxx` 상태로 서비스를 쓰게 됨.

---

### 1.2 이메일·비밀번호 가입 경로 (온보딩 페이지 "Create account")

| 단계 | 화면/처리 | 코드 위치 | 비고 |
|------|-----------|-----------|------|
| 1 | 로그인 페이지 "Sign up with email" | `login/page.tsx` → `Link href="/onboarding"` |  |
| 2 | 온보딩 **mode=signup** | `onboarding/page.tsx` (session 없음) | 이메일·비밀번호·**username**·표시이름·역할 입력 |
| 3 | "Create account" 제출 | `handleSignUp` → `signUpWithPassword(email, password, { username, display_name, main_role, roles })` |  |
| 4 | Supabase Auth: signUp | `auth.ts` | `user_metadata`에 username 등 저장. 이메일 확인 필요 시 **확인 메일 발송** |
| 5a | 즉시 session 있음 | → `saveProfileUnified`로 프로필 저장 후 피드 이동 |  |
| 5b | 이메일 확인 대기 (session 없음) | → "Check your email" 표시, 사용자가 **확인 링크** 클릭 | Supabase 기본 확인 메일 (매직링크 아님) |
| 6 | 확인 링크 클릭 후 | Auth 콜백 또는 리다이렉트 | **auth.users INSERT 시 `handle_auth_user_created_link_external_artist` 트리거** |
| 7 | 트리거 내부 | `p0_auth_link_external_artist_on_signup.sql` | `insert into public.profiles (id, ...) on conflict do nothing` — **username 없이 INSERT** → 테이블 트리거 `profiles_username_autogen`이 **username = user_xxx** 설정 |
| 8 | 사용자 재접속/콜백 | getMyProfile() → **프로필 있음** → 피드 또는 set-password | **갭: 가입 시 입력한 username이 프로필에 반영되기 전에 이미 user_xxx 프로필이 생성됨** |

**갭 요약 (이메일 가입)**  
- **가입 폼에서는 username을 받지만**, 이메일 확인이 켜져 있으면 **계정 생성(INSERT auth.users) 시점에 트리거가 먼저 프로필을 만들고**, 그때는 아직 `user_metadata`를 프로필에 넣는 로직이 없어 **username이 비어 있어서** 자동으로 `user_xxx`가 붙음.  
- 확인 후 로그인해도 **이미 프로필이 있음**으로 처리되어, 온보딩 "프로필 완성" 폼을 다시 보지 못함.

---

### 1.3 유저아이디/표시이름 수정 경로 (설정)

| 단계 | 화면/처리 | 코드 위치 | 비고 |
|------|-----------|-----------|------|
| 1 | 설정 페이지 | `settings/page.tsx` | 프로필 편집 (display_name, username, bio, 역할 등) |
| 2 | 진입 조건 | 로그인 후 **프로필이 이미 있는 사용자**만 접근 | 프로필 없으면 온보딩으로 가므로, 설정에 오는 시점에는 이미 프로필 있음 |
| 3 | 저장 | `saveProfileUnified` → `upsert_my_profile` | `p_base`에 `username` 포함 시 DB에 반영됨 |

**갭 요약 (설정)**  
- **username/표시이름을 바꾸려면** "설정"에서만 가능.  
- 로그인 페이지에는 "이메일/비밀번호로 가입"만 있고, **"가입 후 첫 로그인"과 "프로필 완성(유저아이디 설정)"이 한 흐름으로 이어지지 않음**.  
- 사용자 인식: "유저아이디를 바꾸려면 설정에 가야 하는데, 그 전에 이미 매직링크나 확인 링크 한 번으로 피드에 들어가 버려서 난수 아이디가 박혀 있다"가 됨.

---

### 1.4 set-password 페이지

| 단계 | 화면/처리 | 코드 위치 | 비고 |
|------|-----------|-----------|------|
| 1 | 진입 | 프로필은 있으나 `localStorage HAS_PASSWORD_KEY` 없음 | Auth 콜백 또는 `/`에서 `replace("/set-password")` |
| 2 | 비밀번호 설정 폼 | `set-password/page.tsx` | **비밀번호만** 입력·확인 |
| 3 | 제출 | `supabase.auth.updateUser({ password })` | **매직링크 재발송 없음** |

**정리**  
- set-password는 **비밀번호만** 설정하고, **유저아이디/표시이름을 바꾸는 UI는 없음**.  
- "그 페이지에서 정보를 모두 기입하고 나면 다시 매직링크가 발송되는 것 같다"는 경험은, **온보딩 mode=signup에서 "Create account" 후 이메일 확인이 필요할 때 오는 Supabase 확인 메일**과 혼동된 것으로 보임 (우리 앱이 보내는 매직링크와는 별개).

---

## 2. 초대 링크(전시 위임 등) vs 이메일 계정 생성 — 온보딩 일치 여부

| 진입 경로 | 프로필 생성 시점 | 온보딩 노출 |
|-----------|------------------|-------------|
| **매직링크** (로그인 페이지) | ProfileBootstrap → ensure_my_profile → ensure_profile_row() | 프로필이 없을 때만 → **곧바로 프로필 생성되면 스킵** |
| **이메일·비밀번호 가입** (온보딩 signup) | 확인 클릭 시 auth 트리거 → profiles INSERT (user_xxx) | 확인 후 재접속 시에는 "프로필 있음" → **스킵** |
| **위임 초대 링크** (`/invites/delegation?token=...`) | 로그인 안 된 상태로 토큰만 조회 → "로그인 후 수락" 유도. 로그인은 **매직링크 또는 비밀번호** | 로그인 후 프로필 없으면 온보딩으로 가지만, **역시 ProfileBootstrap이 먼저 프로필 생성** 가능 |
| **아티스트 초대** (작품에서 이메일 초대) | 초대 메일 링크 → 가입/로그인 → 동일 | 위와 동일 |

**정리**  
- **초대 링크로 들어오든, 이메일로 계정을 만들든**, "프로필이 없으면 온보딩"이라는 **판단 기준은 동일**함.  
- 다만 **"프로필이 없음"** 상태가 거의 유지되지 않음.  
  - 매직링크: 레이아웃에서 **온보딩 페이지를 열기 전에** 이미 `ensure_my_profile()`이 프로필을 만들어 버림.  
  - 이메일 가입: 확인 클릭 시 **트리거가 프로필을 먼저** 만들고, 우리가 가입 폼에서 받은 username을 그 INSERT에 넣지 않음.  
- 따라서 **온보딩 UX는 경로별로 다르게 설계된 것이 아니라, "프로필 존재 여부" 하나로만 분기하는데, 프로필이 너무 일찍 생성되어** 온보딩(유저아이디/표시이름 입력)이 스킵되는 구조임.

---

## 3. 유저아이디 수정이 직관적이지 않은 점

- **현재**: 유저아이디·표시이름 변경은 **설정 페이지**에서만 가능.  
- **인지 부담**:  
  - "처음 로그인했는데 이미 @user_xxx로 되어 있다" → 왜 그런지, 어디서 바꾸는지 안내가 없음.  
  - 로그인 화면에는 "이메일/비밀번호로 가입"만 눈에 띄고, **"가입 후 반드시 유저아이디를 정하는 단계"**가 없어 보임.  
- **의도했던 흐름과의 괴리**:  
  - "유저아이디는 최초 온보딩에서 만들도록 유도"하는 것이 맞지만, **현재는 프로필이 먼저 생성되면서** 그 단계가 건너뛰어짐.  
- **set-password와의 혼동**:  
  - set-password는 "비밀번호만 설정"이며, **매직링크를 다시 보내지 않음**.  
  - "정보 기입 후 매직링크가 다시 발송되는 것 같다"는 것은 **이메일 가입 확인 메일**과 혼동된 것으로 보는 것이 타당함.

---

## 4. People 탭 검색 — 유저아이디 vs 표시이름

**코드**  
- People 검색: `searchPeopleWithArtwork` → 내부에서 `searchPeople({ q, roles, limit, cursor })` 호출.  
- DB: `p0_search_fuzzy_pg_trgm.sql` (및 `people_rpc.sql`)의 `search_people`:

```sql
where p.is_public = true
  and (
    p.username ilike v_pattern or p.display_name ilike v_pattern
    or similarity(coalesce(p.username, ''), v_q) > 0.2
    or similarity(coalesce(p.display_name, ''), v_q) > 0.2
  )
```

**결론**  
- **이미 `username`과 `display_name` 둘 다** `ilike` 및 `similarity`로 검색 대상임.  
- 따라서 **People 탭에서 "표시이름(공개이름)으로도 검색되어야 한다"는 요구는 현재 구현으로 충족**되어 있음.  
- 다만 **표시이름이 비어 있는 프로필**이 많다면 (난수 아이디만 있고 display_name 미설정), 표시이름으로는 검색 결과에 잘 안 나올 수 있음. → **온보딩에서 표시이름까지 채우게 하면** 이 갭은 자연스럽게 줄어듦.

---

## 5. 갭 요약 및 개선 방향

| # | 갭 | 원인 | 권장 방향 |
|---|-----|------|-----------|
| 1 | **난수 유저아이디 다발** | (1) 매직링크: ProfileBootstrap이 온보딩보다 먼저 `ensure_my_profile()`로 프로필 생성. (2) 이메일 가입: auth 트리거가 확인 시 프로필을 username 없이 INSERT → 자동 user_xxx. | **온보딩이 끝나기 전에는 프로필을 만들지 않거나**, 프로필 존재 여부를 "username이 user_* 꼴인지" 등으로 보아 **미완료로 간주**하고 온보딩 폼을 반드시 노출. |
| 2 | **유저아이디/표시이름 수정이 어렵게 느껴짐** | 변경은 설정에서만 가능하고, "최초에 한 번 꼭 정하는" 단계가 없음. | **최초 온보딩에서 유저아이디·표시이름을 반드시 입력**하게 하고, 설정에서는 "이후 변경"으로만 두면 됨. |
| 3 | **온보딩이 경로마다 다르게 느껴짐** | 로직은 "프로필 없으면 온보딩"으로 통일돼 있으나, **프로필이 너무 일찍 생성**되어 매직링크/이메일 가입 모두 온보딩이 스킵됨. | 위 1번과 동일: **프로필 생성 시점을 늦추거나**, "온보딩 완료"를 별도 플래그/username 형식으로 정의해 **완료 전에는 항상 온보딩 폼**으로 유도. |
| 4 | **People 검색** | | **표시이름 검색은 이미 구현됨.** 표시이름 미입력 프로필이 많으면 온보딩에서 표시이름 필수화로 보완. |

---

## 6. 구현 시 권장 사항 (요약)

1. **ProfileBootstrap**  
   - **온보딩 경로(`/onboarding`)에서는 `ensure_my_profile()`을 호출하지 않기**  
   - 또는 `ensure_my_profile()`이 **이미 프로필이 있을 때만** "존재 보장"하고, **없을 때는 INSERT하지 않기** (최초 생성은 온보딩 제출 시 `upsert_my_profile` 등으로만).

2. **Auth 트리거 (handle_auth_user_created_link_external_artist)**  
   - 프로필 INSERT 시 **auth.users.user_metadata의 username**을 넘겨서 넣거나,  
   - 트리거에서는 **프로필을 만들지 않고**, 외부 아티스트 링크만 처리하고, **프로필 생성은 온보딩 제출 시에만** 하도록 분리 검토.

3. **온보딩 "완료" 정의**  
   - "프로필이 있다"만 보지 말고, **username이 `user_`로 시작하는지**, 또는 **display_name이 비어 있는지** 등으로 **미완료** 판단 → 미완료면 **항상 온보딩 폼**으로 유도.

4. **set-password**  
   - 현재처럼 **비밀번호만** 두고, 유저아이디/표시이름 변경은 **설정** 또는 **온보딩**에서만 처리.  
   - 필요하면 set-password 화면에 "유저아이디·표시이름은 설정 > 프로필에서 변경할 수 있습니다" 안내 추가.

5. **People 검색**  
   - DB/로직 변경 없이 유지.  
   - 표시이름 검색이 체감되도록 **온보딩에서 표시이름 입력**을 권장/필수로 두면 됨.

---

## 7. 벤치마킹 및 적용한 개선 사항

- **참고한 패턴**: 유사 SNS/서비스에서는 매직링크 클릭 후 **한 번의 화면에서** 유저아이디·공개 이름을 입력하게 하고, **추가 이메일(매직링크) 재발송 없이** 완료하는 흐름이 일반적임.
- **적용한 변경**  
  1. **ProfileBootstrap**  
     - `pathname === "/onboarding"`일 때 **`ensure_my_profile()` 호출을 하지 않음**.  
     - 매직링크 진입 시 콜백이 `/onboarding`으로 보내면, 프로필이 아직 없어 **온보딩 폼(유저아이디·표시이름·역할)이 노출**되고, 제출 시 `saveProfileUnified` → `upsert_my_profile`로 **한 번에 저장** (매직링크 재발송 없음).
  2. **온보딩 문구**  
     - "프로필 완성" 화면에 **"유저 아이디와 공개 이름을 입력하세요. 추가 이메일 링크는 발송되지 않습니다"** 안내 추가 (i18n: `onboarding.completeProfileHint`).
  3. **온보딩 제출 후 이동**  
     - 매직링크 사용자는 비밀번호가 없을 수 있으므로, 제출 후 `localStorage HAS_PASSWORD_KEY`가 없으면 **`/set-password`**, 있으면 **`/feed`**로 이동.
  4. **난수 아이디 사용자 배너**  
     - `username`이 `user_` + 8자 16진수 패턴(`user_xxxxxxxx`)인 사용자에게 **헤더 하단 배너**로  
       "임시 아이디를 사용 중입니다. 댓글·태깅을 위해 **설정에서 유저 아이디를 설정하세요**" 안내 + **설정으로 이동** 링크.  
     - 배너는 닫기 가능하며, 닫은 경우 `localStorage`에 저장해 재노출하지 않음 (`RandomIdBanner`).

이 문서는 코드와 마이그레이션을 기준으로 한 감사 결과이며, 실제 수정 시에는 RLS·트리거·클라이언트 호출 순서를 함께 점검하는 것이 좋다.
