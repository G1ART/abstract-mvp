# 멀티플 클레임 허용 현황 + 전시(프로젝트) 버킷 설계

## 1. 현재 빌드: 멀티플 “현재 진행” 클레임 허용 여부

### 1.1 결론: **허용되어 있음**

- **DB**: `claims` 테이블에 `(work_id, claim_type, subject_profile_id)`에 대한 **unique 제약이 없음**. 동일 작품에 대해 서로 다른 주체(subject)가 같은 claim_type으로 여러 row를 가질 수 있음.
- **get_current_delegate_ids**: `work_id` + `claim_type IN ('INVENTORY','CURATED','EXHIBITED')` + `status = 'confirmed'` + `period_status = 'current'`(또는 null) 조건으로 **모든 해당 row의 subject_profile_id**를 distinct 반환.
- **프로비넌스**: confirmed 클레임만 표시, 동일 claim_type 여러 row 모두 별도 행으로 표시.

| 엔티티/관계 | 동시에 여러 주체 허용? |
|-------------|------------------------|
| **CURATED** | ✅ 예 |
| **OWNS** | ✅ 예 (공동 소장) |
| **EXHIBITED** | ✅ 예 (여러 갤러리 또는 같은 갤러리의 과거 전시 + 현재 컨사인먼트) |

### 1.2 EXHIBITED “동시에 두 가지 current” 시나리오

- 현재 모델로 모두 표현 가능. 전시 버킷 도입 시 **전시 기간 종료 = 해당 전시는 past**, **새 전시 = current**로 정리 (Q4 반영).

---

## 2. project_id 현재 용도 (혼용 방지)

### 2.1 스키마 상 정의

- **claims.project_id**: `p0_claims.sql`에서 `work_id XOR project_id` 제약으로, 클레임 한 row는 **작품 단위(work_id)** 또는 **프로젝트 단위(project_id)** 둘 중 하나만 가짐.
- **projects 테이블**: `p0_projects.sql` — "Provenance v1: projects (exhibition / curated program)". 컬럼: `id`, `project_type`(default `'exhibition'`), `title`, `start_date`, `end_date`, `status`(planned|live|ended), `curator_id`, `host_name`, `host_profile_id`.
- **의도**: project_id가 있으면 “이 클레임은 **프로젝트(전시) 전체**에 대한 것” (예: HOSTS_PROJECT, 큐레이터가 “이 전시를 기획했다”). work_id가 있으면 “이 클레임은 **이 작품**에 대한 것” (OWNS, EXHIBITED, CURATED 등).

### 2.2 앱에서의 실제 사용

- **현재**: UI/플로우에서 **전시 생성·편집·project_id 설정하는 코드 없음**. RPC(`create_claim_for_existing_artist`, `create_external_artist_and_claim`)는 `p_project_id` 파라미터를 받지만, 업로드/작품 상세 등 모든 진입점은 `work_id`만 사용. 즉 **project_id는 “예약된” 상태이고, 전시 버킷 기능이 들어가기 전까지 혼용 이슈는 없음**.
- **표시**: `claimTypeToLabel()`에서 `projectTitle`을 쓰는 분기(CURATED, INCLUDES_WORK)는 있으나, project_id로 조회하는 데이터 경로는 미구현.

### 2.3 정리

- **용도 고정**: `project_id`는 “**전시(또는 향후 다른 프로젝트 타입) 단위**” 클레임용으로만 사용. “이 작품이 이 전시에 포함된다”는 **작품–전시 소속**은 별도 테이블로 두어, “클레임”과 “전시 버킷 소속”을 분리하는 것이 안전함 (아래 네이밍·스키마 참고).

---

## 3. 사용자 확정 답변 반영

### Q1. 작품–전시 소속 + 네이밍

- **결정**: 기존 `project_id`는 “프로젝트 단위 클레임” 용도로 유지. **작품–전시 소속**은 별도 테이블로 두고, **즉시 의미가 드러나는 네이밍** 사용.
- **네이밍**: `project_artworks` 대신 **`exhibition_works`** 사용.  
  - `exhibition_works(exhibition_id, work_id, ...)`  
  - `exhibition_id` → `projects.id` FK (현재는 `project_type = 'exhibition'`인 row만 사용하므로 “전시 = project 한 건”으로 취급).  
  - 테이블 이름만으로 “전시에 포함된 작품” 관계임을 알 수 있음.
- **전시의 포괄성**: 전시 버킷은 “작가 1명 또는 여럿 + 작품 여럿”을 포괄하고, 작품은 기존처럼 프로비넌스(작가/큐레이터/갤러리/콜렉터)가 촘촘히 붙은 상태로 유지. 전시는 그 위에 “한 단계 더 포괄적인 프로비넌스 네트워킹”으로 붙는 개념.

### Q2. 전시 생성·편집 주체

- **선택: C** (A + B 둘 다). **우선 구현: A** (큐레이터/갤러리만 전시 생성·편집), 이후 **B** (작가의 “전시에 내 작품 넣어달라” 요청) 추가.

### Q3. 전시에 작품 넣을 때 클레임 생성 시점

- **선택: A, B, C 모두 가능**하도록. 유저가 편한 쪽을 선택.
  - **A**: 전시 생성 시 작품 N개 선택 → 해당 작품에 대해 EXHIBITED/CURATED 클레임 **pending** 일괄 생성 → 작가 벌크 confirm.
  - **B**: 전시만 먼저 생성, 이후 “작품 추가” 시마다 해당 작품 클레임 pending 생성 (labor-intensive하지만 “쉽다”고 느낄 수 있음).
  - **C**: 전시 초대(링크/이메일)로 작가가 참여 수락 시 해당 작품 클레임 confirmed 생성.
- **인터페이스**: 진입점을 “전시 만들기 + 작품 한 번에 선택” / “전시 만들고 나중에 작품 추가” / “작가 초대로 참여 수락” 세 가지로 나누고, 공통 백엔드(전시 생성, exhibition_works, 클레임 생성/확정)만 두면 복잡도를 줄일 수 있음. UI는 단계별로 노출(예: “작품을 지금 추가” vs “나중에 추가” vs “작가 초대 링크 보내기”)하면 됨.

### Q4. 전시 기간과 “현재 진행” 정의

- **선택**: **전시 기간이 끝나면 그 전시는 과거(past)**. 컨사인먼트 컨틴전시가 있더라도 “그 전시”는 종료로 간주하고, **새로 열리는 전시가 현재(current)**. (컨사인먼트로 새 전시에 걸면 이전 갤러리는 판매 수익 공유에 불과하다는 현실 반영.)
- **구현 방향**:  
  - 전시(project)에 `start_date`, `end_date`가 있으면, **“이 전시가 현재 진행인가”**는 `CURRENT_DATE BETWEEN start_date AND end_date` (및 status=live 등)로 판단.  
  - 해당 전시에 연결된 클레임(또는 exhibition_works를 통해 연결된 작품의 클레임)의 **period_status**는 **전시 기간에 따라 파생**하거나, 전시 생성/수정 시 기간에 맞춰 claim의 period_status/start_date/end_date를 세팅.  
  - 즉, “현재 진행 전시”가 활성화되면 그 전시에 속한 작품·클레임이 current로 보이고, 기간이 지난 전시는 past로 전환.

### Q5. 퍼블릭 프로필 탭 구조 (큐레이터 / 갤러리 / 아티스트)

전시 버킷은 큐레이터·갤러리만 쓰는 게 아니라 **아티스트도 동일한 전시 단위를 활용**하면, “살아 있는 포트폴리오”가 한 번에 정리된다. 개인전이든 단체전이든 “내가 참여한 전시”를 한눈에 보고, 전시별로 “그 전시에 참여한 내 작품”을 보여줄 수 있게 한다.

- **구조**: 상단/하단 분리가 아니라 **탭 구조**. 페르소나별로 첫 탭과 별도 탭 구성.

#### 큐레이터
- **첫 탭 (기본)**: “내가 기획한 전시” — 최신순 기본, 특정 전시 핀 가능, 정렬 순서 조정 가능.
- **별도 탭**: 큐레이션한 작품 탭, 좋아요한 작품 탭 등. **핀·작품 순서 조정** 가능.

#### 갤러리
- **첫 탭 (기본)**: “우리 공간에서 진행 중인 전시” — 최신순 기본, 특정 전시 핀 가능, 정렬 순서 조정 가능.
- **별도 탭**: 전시한 적 있는 작품 탭, 현재 수장고에서 보관·딜링 중인 작품 탭 등. **핀·작품 순서 조정** 가능.

#### 아티스트
- **첫 탭 (기본)**: “내 작품” — 기존처럼 CREATED 기준 작품 목록.
- **별도 탭**: **“내가 참여한 전시”**  
  - 개인전·단체전 구분 없이, **내 작품이 포함된 전시 버킷** 목록.  
  - 각 전시를 클릭하면 **그 전시에 참여한 내 작품만** 모아서 표시 (전시 제목·기간·장소와 함께).  
  - 데이터: `exhibition_works`에서 내 작품(artwork.artist_id = 나)이 포함된 exhibition_id 목록 → projects 조인 → 전시 카드. 전시 상세에서는 해당 전시의 exhibition_works 중 “내 작품”만 필터.
- 이렇게 하면 큐레이터/갤러리가 만든 전시 버킷을 **작가도 그대로 이용**해, 참여 이력이 전시 단위로 정리된 포트폴리오가 완성된다.

---

## 4. 스키마 방향 (충돌 최소화)

### 4.1 전시 = projects (기존 유지) + 장소(venue) 연결 (D3 B)

- `projects` 테이블은 그대로 두고, `project_type = 'exhibition'`인 row를 “전시”로 사용. (향후 다른 project_type 확장 가능.)
- 전시 메타: `title`, `start_date`, `end_date`, `status`, `curator_id`, `host_name`, `host_profile_id`.  
- **D3 B**: 전시가 꼭 갤러리에서만 열리는 것이 아니므로, **장소(venue) 테이블**을 두고 `projects`에 `venue_id`(또는 다대다)로 연결. “우리 공간에서 진행 중인 전시”는 venue–프로필 연결로 조회. 단일 갤러리(프로필 1 = venue 1)인 경우에도 동일 구조로 A 결과 구현 가능.

### 4.2 작품–전시 소속: exhibition_works (신규)

- **테이블**: `exhibition_works`  
  - `exhibition_id` uuid NOT NULL → `projects(id)`.  
  - `work_id` uuid NOT NULL → `artworks(id)`.  
  - `added_by_profile_id` uuid NULL → `profiles(id)`. (D1 확정: “이 작품을 이 전시에 넣은 사람” — 업로드/클레임을 수행한 갤러리·큐레이터 계정 또는 대행한 사람. **데이터는 저장하되 퍼블릭 게시물에는 노출하지 않음.**)  
  - 필요 시: `sort_order`, `created_at`.  
  - UNIQUE(exhibition_id, work_id).
- **의미**: “이 전시(project)에 이 작품이 포함된다.”  
- **claims와 분리**: “누가 이 전시에서 이 작품을 전시/큐레이팅했는지”는 기존처럼 **work 단위 claims**(EXHIBITED/CURATED, work_id)로 유지. 전시에 작품을 넣을 때 해당 work에 대한 claim을 pending으로 만들고, 전시 정보(제목·기간)는 project에서 가져와 표시.  
- 이렇게 하면 **claims 제약(work_id XOR project_id) 변경 없이** 전시 버킷과 작품–전시 소속을 도입할 수 있음.

### 4.3 전시–장소(멀티테이블) — D3 확정: B

- 전시는 갤러리에서만 열리는 것이 아니므로, **장소(공간/갤러리)를 별도 엔티티로 두고 전시와 다대일(또는 다대다)로 연결**하는 구조가 필요함 (B).
- **구현 시**: `venues`(또는 `exhibition_venues`) 테이블을 두고, `projects`에 `venue_id` FK 등으로 “이 전시가 어디서 열렸는지” 연결. 한 갤러리 프로필이 여러 venue를 운영할 수 있으면, “우리 공간에서 진행 중인 전시”는 “venue가 우리 소유/운영인 전시”로 조회.  
- **A와의 관계**: B로 가도 A는 달성 가능. 단일 갤러리(프로필 1개 = venue 1개)인 경우 `host_profile_id` 또는 venue–profile 연결로 “우리 공간의 전시” 조회 가능. B는 멀티 venue를 지원하는 확장.

### 4.4 (선택) claim과 전시 연결

- 1차는 **exhibition_works**만으로 “이 작품이 참여한 전시 목록” 표시. “이 전시에서 이 작품을 누가 기획/전시했는지”는 project.curator_id / host_profile_id로 공개용, exhibition_works.added_by_profile_id는 **관리/내부용이며 퍼블릭 노출 안 함** (D1).

---

## 5. 기존 백엔드/페이지와의 정합성

### 5.1 건드리지 않는 부분

- **get_current_delegate_ids**: work_id 기반, INVENTORY/CURATED/EXHIBITED + confirmed + period_status. 전시 버킷은 “작품–전시 소속”만 추가하므로 이 함수는 그대로 사용. (전시 기간에 따라 period_status를 갱신하는 정책만 맞추면 됨.)
- **가격 문의/알림**: 전부 work 기반. 변경 없음.
- **작품 상세/프로비넌스**: 기존 claims(work_id) + artwork. 전시 정보만 “이 작품이 포함된 전시 목록”을 exhibition_works + projects로 보강해서 표시하면 됨.
- **personaTabs**: 현재 all / CREATED / OWNS / INVENTORY / CURATED. **큐레이터/갤러리**는 “기획한 전시”/“진행 중인 전시” 탭 추가(projects + exhibition_works). **아티스트**는 “내 작품” 기본 탭에 더해 “내가 참여한 전시” 탭 추가(exhibition_works → 내 작품이 포함된 전시 목록 → 전시별 내 작품).

### 5.2 추가/변경 필요

- **projects**: 이미 존재. 전시 생성/편집 UI와 API만 추가.
- **exhibition_works**: 신규 테이블, RLS, 인덱스(exhibition_id, work_id).
- **전시 기간 → period_status** (D2 확정): **데이터가 있는 경우**(전시에 end_date가 있고 이미 경과)에는 **자동으로 past로 갱신** (cron/트리거). **데이터가 없는 경우**(end_date 없거나 자동 판단 불가)에는 **수동**으로 period_status 변경 가능하도록 둠.
- **프로필 탭**: (1) **큐레이터/갤러리**: 첫 탭 “기획한 전시”/“진행 중인 전시”, 그다음 “큐레이션 작품”/“전시한 작품”/“수장고·딜링 작품” 등. (2) **아티스트**: 첫 탭 “내 작품”, 그다음 “내가 참여한 전시”(전시 버킷 목록 → 전시별 내 작품). 핀/정렬은 기존과 유사한 메커니즘 확장.

### 5.3 잠재적 충돌 지점

- **claims.project_id 기존 제약**: 지금은 work_id XOR project_id. **exhibition_works만 쓸 경우** 이 제약은 그대로 두면 되고, project_id는 “프로젝트 단위 클레임”(HOSTS_PROJECT 등) 전용으로만 쓰면 혼용 없음.
- **period_status**: D2에 따라 전시 end_date 등 데이터가 있으면 자동 past 갱신, 없으면 수동. 기존 delegate/가격 문의 로직은 그대로 claim.period_status 기준.

---

## 6. D1~D5 확정 사항

### D1. exhibition_works에 “이 작품을 이 전시에 넣은 사람”

- **확정**: **컬럼 생성·데이터 저장**, **퍼블릭 노출 안 함**.
- “넣은 사람” = 해당 작품을 전시에 업로드/클레임한 사람(갤러리·큐레이터 계정 또는 대행한 사람). 누군가 대행할 수 있으므로 기록은 남기고, **퍼블릭 게시물(전시 상세·프로비넌스 등)에는 표시하지 않음**. 관리/내부용으로만 사용.

### D2. 전시 기간 종료 시 period_status

- **확정**: **데이터가 있는 경우 자동 past 갱신**, **데이터가 없는 경우 수동**.
- 전시에 end_date가 있고 이미 경과한 경우 → 해당 전시에 연결된 클레임의 period_status를 **자동으로 past로 갱신** (cron/트리거).
- end_date가 없거나 자동 판단이 불가한 경우 → **수동**으로 period_status를 past로 변경할 수 있도록 UI/API 제공.

### D3. 프로필 “첫 탭” 데이터 소스 — 장소(멀티테이블)

- **확정**: **B**. 전시는 갤러리에서만 열리는 것이 아니므로, **장소(공간/갤러리)를 별도 테이블로 두고 전시와 연결** (멀티 venue 지원).
- **A와의 관계**: B로 구현해도 A는 달성 가능. 단일 갤러리(프로필 1 = venue 1)인 경우에도 “우리 공간의 전시”를 venue–profile 연결 또는 host_profile_id로 조회하면 됨.

### D4. A/B/C 플로우 공통화

- **확정**: 하나의 “전시에 작품 추가” API를 두고, A(일괄)/B(개별)/C(초대 수락)는 UI 진입점만 다르게 둠.

### D4-2. 전시 생성 시 “기존 작품 선택” + “새 작품 업로드” 한꺼번에 구현

- **결정**: 1차(기존 작품만) / 2차(새 작품 업로드)로 나누지 않고 **한 번에 구현**.
- **이유**: 작가들은 새 전시에 새 작품을 넣는 경우가 많음. 순차적 액션(전시 생성 → 작품 추가 시 “기존 선택” 또는 “지금 업로드”)이라도 같은 플로우에서 지원하는 것이 적절함.
- **구현**: 기존 작품 추가 = exhibition_works INSERT + (선택) pending 클레임. 새 작품 = 기존 업로드 API(작품 생성 + 클레임) 재사용 후 동일하게 exhibition_works 추가. 스키마/클레임 로직 재사용으로 **충돌·난이도 급상승 없음**.

### D6. 전시에서 작품 제거 시 정책

- **확정**: 전시에서 작품을 **뺄 때**는 **exhibition_works에서만 해당 행 삭제**(해당 전시 리스트에서만 제외). **CURATED/EXHIBITED 클레임은 삭제·취소하지 않음**.
- **이유**: 나중에 같은 작품을 다시 그 전시에 넣을 수 있음. 프로비넌스(큐레이션/전시 이력)는 유지하고, “이 전시 버킷에 포함 여부”만 exhibition_works로 관리.
- **추가**: 전시·클레임의 “수정”(기간, 제목, 클레임 내용 등)은 별도 케이스로, 케이스를 더 본 뒤 정리.

### D5. “전시한 작품” / “참여한 전시” 데이터 소스

- **확정**: **둘 다**.
  - **전시 탭**: 전시 버킷 리스트(projects + exhibition_works 기준).
  - **전시한 작품 탭**: **클레임(EXHIBITED 등)되거나 전시(exhibition_works)에 포함된 작품을 모두 개별로 나열**. 즉 claim 기반 작품 + 전시 버킷에만 들어간 작품을 합쳐서 한 목록으로 표시.

---

## 7. 요약

| 항목 | 상태 |
|------|------|
| 멀티플 CURATED/OWNS/EXHIBITED | ✅ 현재 빌드로 허용 |
| project_id 현재 용도 | 스키마만 사용, 앱 미사용. “프로젝트 단위 클레임” 전용으로 유지 권장 |
| 작품–전시 소속 | `exhibition_works(exhibition_id, work_id)` 신규 테이블로 도입 (네이밍 명확) |
| Q2 | C, A 먼저 구현 후 B |
| Q3 | A·B·C 모두 지원, 공통 API + UI 진입점 분리로 복잡도 관리 |
| Q4 | 전시 기간 종료 = past, 현재 진행 전시 = current (전시 기간 기준) |
| Q5 | 탭 구조. 큐레이터/갤러리 첫 탭 = 기획한 전시/진행 중인 전시. **아티스트** 기본 탭 = 내 작품, 별도 탭 = **내가 참여한 전시**(전시 버킷 목록 → 전시별 내 작품). 핀·정렬 지원. |
| **D1** | exhibition_works에 `added_by_profile_id` 컬럼 생성·데이터 저장. **퍼블릭 노출 안 함** (관리/내부용). |
| **D2** | 전시 기간 데이터 있으면 **자동 past 갱신**, 없으면 **수동** 변경. |
| **D3** | **B**. 장소(venue) 멀티테이블. 전시–장소 연결. B로 해도 A(단일 갤러리 “우리 공간 전시”) 구현 가능. |
| **D4** | “전시에 작품 추가” 단일 API, A/B/C는 UI 진입점만 분리. |
| **D4-2** | 전시 생성 시 “기존 작품 선택”과 “새 작품 업로드” 한꺼번에 구현(기존 업로드 재사용). |
| **D5** | **둘 다**. 전시 탭 = 전시 버킷 리스트. 전시한 작품 탭 = 클레임(EXHIBITED 등) 또는 전시(exhibition_works)에 포함된 작품 **모두 개별 나열**. |
| **D6** | 전시에서 작품 제거 = exhibition_works만 삭제. CURATED/EXHIBITED 클레임은 유지(재추가 가능). |

이 문서와 D1~D6 확정을 바탕으로, 다음 단계에서 **마이그레이션(exhibition_works, venues, 필요 시 projects 컬럼)** 과 **API·화면 플로우**를 구체화하면 됩니다.
