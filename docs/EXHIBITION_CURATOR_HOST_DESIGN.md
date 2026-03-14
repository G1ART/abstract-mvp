# 전시: 큐레이터 · 갤러리/호스트 분리 및 상호 초대 설계

## 1. 배경과 목표

- 전시 게시물을 **만드는 주체**는 **큐레이터**일 수도 있고 **갤러리/갤러리스트**일 수도 있다.
- 예: **작가 A**의 전시를 **큐레이터 B**가 큐레이팅하고 **갤러리 C** 공간에서 열었다고 하면:
  - **갤러리 C**가 전시 게시물을 만들고 작품을 올리는 경우: 현재는 “큐레이터 B”의 자리가 없어서, **B가 큐레이터로 크레딧·권한을 갖도록** 해야 한다.
  - **큐레이터 B**가 업로드하는 경우: **어디서(어느 갤러리에서) 연 전시인지**를 올릴 수 있어야 한다.
- **상호 초대**가 가능해야 하며, **갤러리/갤러리스트가 직접 큐레이션한 경우**(한 사람이 큐레이터이자 호스트)도 그대로 지원해야 한다.
- **정보 입력 · 권한 공유 · 프로비넌스**가 전시 생성/수정 시점에 정리되고, **클레임으로 넘기지 않아도** 되게 한다(업로드/편집할 때 정리).

---

## 2. 현재 스키마와 동작

- **projects** (전시):
  - `curator_id` (NOT NULL): 현재는 “전시를 만든 사람”이자 “큐레이터”로 혼용.
  - `host_name` (text): 호스트/장소 이름.
  - `host_profile_id` (uuid): 호스트 프로필(갤러리 등).
- **RLS** (p0_delegations_exhibition_works_projects_rls.sql):
  - **Insert**: `curator_id = auth.uid() or host_profile_id = auth.uid()`  
    → **호스트(갤러리)가 생성할 때** `host_profile_id = 본인`, `curator_id = 다른 사람(큐레이터)` 조합이 **이미 허용**됨.
  - **Update/Delete**: `curator_id = auth.uid() or host_profile_id = auth.uid()` 또는 위임.
- **문제**: 앱/API에서 **갤러리가 생성 시 큐레이터를 지정**하거나, **큐레이터가 생성 시 호스트를 지정**하는 입력이 없음.  
  → `createExhibition`이 항상 `curator_id = session.user.id`(또는 forProfileId)로만 넣고, `curator_id`/`host_profile_id`를 따로 넘길 수 없음.

---

## 3. 설계 방향

- **스키마는 그대로 두고**, `curator_id`와 `host_profile_id`의 **의미만 명확히** 한다.
  - **curator_id**: 이 전시의 **큐레이터**(크레딧 + 전시 관리 권한).
  - **host_profile_id** / **host_name**: 이 전시의 **호스트/장소**(갤러리·갤러리스트 등).
- **생성자**는 “insert 시점에 `curator_id = auth.uid()` 또는 `host_profile_id = auth.uid()`인 사람”으로 정의.  
  즉, **큐레이터가 만들면** 생성자 = 큐레이터, **갤러리가 만들면** 생성자 = 호스트.  
  별도 `creator_id` 컬럼은 두지 않고, “내가 만든 전시”는 **listMyExhibitions**에서 이미 `curator_id` 또는 `host_profile_id`로 나오므로 그대로 사용.
- **업로드/편집 시점에** 큐레이터·호스트를 지정하고, **클레임으로 역할을 나누지 않는다.**

---

## 4. 역할 시나리오 정리

| 시나리오 | 생성 주체 | curator_id | host_profile_id / host_name | 비고 |
|----------|-----------|------------|------------------------------|------|
| 큐레이터 B가 전시 생성, 갤러리 C에서 개최 | B | B | C 또는 host_name "Gallery C" | B가 호스트 검색/입력 |
| 갤러리 C가 전시 생성, 큐레이터 B가 큐레이팅 | C | B | C | C가 큐레이터 B 검색/선택 |
| 갤러리 C가 직접 큐레이션·개최 | C | C | C | “Exhibited & Curated by C” (기존 로직 유지) |
| 큐레이터 B만 (장소 없음) | B | B | null | “Curated by B” |

---

## 5. API 변경

### 5.1 createExhibition

- **추가 인자**:
  - `curator_id?: string | null` — 지정하지 않으면 `session.user.id`(본인을 큐레이터로).
  - 기존: `host_name`, `host_profile_id` (유지).
- **로직**:
  - `curator_id = args.curator_id ?? session.user.id`.
  - Insert 시 RLS: `curator_id = auth.uid() or host_profile_id = auth.uid()`.
  - 갤러리 C가 만드는 경우: `curator_id = B`, `host_profile_id = C`로 넣으면 `host_profile_id = auth.uid()` 만족.

### 5.2 updateExhibition

- **patch에 curator_id 추가**: 전시 메타 수정 시 큐레이터 변경 가능.
- 기존: title, start_date, end_date, status, host_name, host_profile_id, cover_image_paths.

---

## 6. UI (전시 생성/수정 폼)

### 6.1 “큐레이터” 필드

- **라벨**: “큐레이터” / “Curator”.
- **선택**:
  - **나** (기본): `curator_id = 현재 사용자`.
  - **다른 사람**: 프로필 검색 → 선택 시 `curator_id = 선택한 프로필`.
- 갤러리가 전시를 만들 때는 “다른 사람”으로 큐레이터 B를 검색해 지정.

### 6.2 “호스트 / 장소” 필드

- **라벨**: “호스트(갤러리·장소)” / “Host / Venue”.
- **선택**:
  - **텍스트만**: `host_name`만 입력, `host_profile_id = null`.
  - **프로필 연결**: 프로필 검색 → 선택 시 `host_profile_id = 선택한 프로필`, `host_name`은 보조(표시용 덮어쓸 수 있음).
- 큐레이터가 전시를 만들 때는 “호스트”에 갤러리 C를 검색하거나 이름 입력.

### 6.3 갤러리/갤러리스트가 직접 큐레이션

- 큐레이터 = “나”, 호스트 = “나”(프로필 선택) 또는 갤러리 이름 입력.
- 기존처럼 `curator_id === host_profile_id`일 때 “Exhibited & Curated by [Name]” 표시 유지.

### 6.4 권한 공유

- **curator_id**에 설정된 프로필: 전시 목록에 노출, 전시 메타/작품 등 관리 권한(기존 RLS).
- **host_profile_id**에 설정된 프로필: 동일하게 목록 노출 및 관리 권한(기존 RLS).
- 위임(delegation)은 그대로 두어, 큐레이터/호스트가 추가로 “관리자”를 초대할 수 있게 유지.

---

## 7. 프로비넌스·크레딧

- 전시 노드는 **curator_id**, **host_profile_id**, **host_name**만으로 “누가 큐레이팅했고, 어디서 열렸는지” 표현.
- **getExhibitionHostCuratorLabel** 로직 유지:
  - curator_id = host_profile_id → “Exhibited & Curated by [Name]”.
  - 그 외 → “Exhibited by [Host] · Curated by [Curator]” 등.
- 클레임으로 “이 전시의 큐레이터다”를 보충하지 않고, **전시 메타에서만** 정리.

---

## 8. 알림(선택)

- **curator_id** 또는 **host_profile_id**에 **다른 사람**을 설정했을 때:
  - “OO 전시에 큐레이터로 추가되었습니다” / “OO 전시에 호스트(갤러리)로 추가되었습니다” 이메일/인앱 알림.
- 수락/거절 플로우는 **1차에서는 생략**하고, “업로드할 때 정리”에 맞춰 **설정 즉시 반영**만 해도 됨.  
  (나중에 “초대 수락”을 넣을 경우, pending 초대 테이블을 추가하는 방식으로 확장 가능.)

---

## 9. 구현 체크리스트

- [ ] **createExhibition**: `curator_id` 인자 추가, 기본값 `session.user.id`.
- [ ] **updateExhibition**: patch에 `curator_id` 추가.
- [ ] **전시 생성 폼** (new): 큐레이터(나 / 검색), 호스트(텍스트 / 검색) 입력.
- [ ] **전시 수정 폼** (edit): 동일 필드 편집 가능.
- [ ] **listMyExhibitions** / **listExhibitionsForProfile**: 이미 `curator_id`·`host_profile_id` 기준이므로 변경 없음.
- [ ] (선택) 큐레이터/호스트로 **다른 사람**이 설정되었을 때 알림 발송.

---

## 10. 정리

- **큐레이터**와 **갤러리/호스트**를 전시 생성·수정 시점에 명시하고, **상호 초대**는 “큐레이터 검색 후 지정” / “호스트 검색 후 지정”으로 구현.
- **갤러리가 직접 큐레이션**한 경우는 큐레이터=호스트=본인으로 두어 기존처럼 표시.
- RLS는 이미 “curator 또는 host가 insert/update”를 허용하므로, **API·폼만 보강**하면 되고, **클레임 없이** 전시 메타만으로 프로비넌스 포인트(큐레이터·호스트)를 형성할 수 있다.
