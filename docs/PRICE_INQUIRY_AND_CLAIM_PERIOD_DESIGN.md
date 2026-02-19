# 가격 문의 고도화 + 클레임 기한 설계 (구현 명세)

## 사용자 확정 사항

1. **문의 수신**: 갤러리·갤러리스트·큐레이터 모두에게 문의 알림 → **누군가 한 명이 먼저 답변하면 그 답변이 모두에게 공유되고 인쿼리 종료**. 구현 부담이 크면 fallback: 작가가 명시적으로 “가격 문의 담당자” 지정.
2. **EXHIBITED 포함**: 갤러리/갤러리스트/큐레이터 모두 딜에 참여 가능. 동일하게 “문의는 모두에게, 첫 답변 시 공유·종료”.
3. **기간**: 정확한 날짜보다 **(1)과거 종료 (2)현재 진행 (3)미래 예정** 구분이 우선. 피드·공개 프로필에는 **현재 진행**만, 과거/미래는 별도 히스토리(링크)로.
4. **연장**: Option B (트리거 기반).
5. **작가**: 답변 권한 제한 없음. delegate가 있으면 실무는 delegate, 알림만 받아도 됨.
6. **Q1 확정**: B — optional `end_date`를 Phase 1부터 두고, 연장 시 `end_date`를 +6개월/+1년 갱신. 자동 종료 감지도 동일 메커니즘.
7. **Q2 확정**: A+B 하이브리드 — **요청자**가 클레임 요청 시 period_status 선택, **작가**가 confirm 시 잘못된 경우 수정 가능.

---

## 1. 데이터 모델

### 1.1 claims 테이블 확장

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `period_status` | text | 'past' \| 'current' \| 'future'. INVENTORY/CURATED/EXHIBITED에서 **필수**(confirmed 후). |
| `start_date` | date | optional, 표시/정렬용 |
| `end_date` | date | optional. **연장 시 여기만 갱신**(+6개월/+1년). 이 값 경과 시 자동 종료·연장 알림. |

- **CREATED** 클레임: period_status 사용 안 함(또는 항상 'current'로 간주).
- **INVENTORY / CURATED / EXHIBITED**  
  - **요청 시**: 요청자(갤러리/큐레이터)가 period_status 선택 (제안값).  
  - **확인 시**: 작가가 confirm 하면서 그대로 수락하거나 **수정** 가능. 최종 확정값만 DB에 저장.

**과거/현재/미래 판단 (표시·라우팅용)**  
- `past`: 과거 종료  
- `current`: 현재 진행  
- `future`: 미래 예정  

**period_status 설정 흐름 (Q2 A+B 하이브리드)**  
1. **요청 단계**: 갤러리/큐레이터가 클레임 요청 시 period_status를 선택(제안). (pending 상태로 저장 가능하거나, confirm 시점에만 저장해도 됨.)  
2. **확인 단계**: 작가가 클레임 확인 시, 요청자가 제안한 period_status를 **그대로 수락하거나 수정**한 뒤 확정. 최종값만 `claims.period_status`에 저장.  
3. UI: 요청 시 선택 필드 필수, 확인 화면에서 같은 필드 편집 가능(기본값 = 요청 시 선택값).

### 1.2 price_inquiries 테이블 확장

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `replied_by_id` | uuid (profiles.id) | 실제 답변한 사람 (작가 또는 delegate). NULL = 미답변. |

- 기존 `artist_reply`, `replied_at` 유지.  
- “첫 답변만 허용”은 DB 제약 또는 트리거로 보장: `replied_at IS NULL`일 때만 UPDATE 허용.

### 1.3 notifications 확장

- 기존: `price_inquiry`, `price_inquiry_reply`
- 추가 타입:
  - `price_inquiry_to_delegate` — 콜렉터가 (작품 X에 대해) 가격 문의함 → **수신: 작가 + 해당 작품의 모든 current delegate**
  - `price_inquiry_reply` — 기존 유지. **수신: 문의자 + (답변자가 아닌) 작가 + (답변자가 아닌) 나머지 delegate**

(실제로 “문의”는 한 건이므로, 수신자만 여러 명으로 넣으면 됨.)

---

## 2. 핵심 함수

### 2.1 현재 진행형 delegate 목록 (작품 기준)

```sql
-- 해당 작품에 대한 "현재 진행형" INVENTORY/CURATED/EXHIBITED 클레임의 subject_profile_id 목록 (중복 제거)
get_current_delegate_ids(p_artwork_id uuid) → setof uuid
```
- 조건: `work_id = p_artwork_id`, `claim_type IN ('INVENTORY','CURATED','EXHIBITED')`, `status = 'confirmed'`, `period_status = 'current'`.

### 2.2 가격 문의 수신자 목록 (문의 생성 시·알림용)

```sql
-- 문의 알림을 보낼 대상: 작가 + 현재 진행형 delegate 전원
get_price_inquiry_recipient_ids(p_artwork_id uuid) → setof uuid
```
- CREATED 클레임의 subject_profile_id (작가) 1명  
- + get_current_delegate_ids(p_artwork_id)  
- 중복 제거, 문의자(inquirer_id) 제외.

### 2.3 “이 사용자가 이 작품에 대해 답변 가능한가?” (RLS·UI용)

```sql
-- 작가이거나, 현재 진행형 delegate 중 한 명이면 true
can_reply_to_price_inquiry(p_artwork_id uuid, p_user_id uuid) → boolean
```
- 기존 `can_reply_to_price_inquiry(p_artwork_id)`는 `auth.uid()` 기준으로 이 로직 호출하도록 확장.

---

## 3. 문의 플로우 (모두에게 알림, 첫 답변 시 공유·종료)

### 3.1 문의 생성 (INSERT)

1. collector가 `price_inquiries` INSERT (기존과 동일).
2. 트리거 `notify_on_price_inquiry` 수정:
   - `get_price_inquiry_recipient_ids(new.artwork_id)`로 수신자 목록 조회.
   - **각 수신자마다** notification 1건 INSERT  
     - type: `price_inquiry` (또는 delegate용이면 `price_inquiry_to_delegate`로 구분 가능).
     - actor_id: inquirer_id, artwork_id, payload.inquiry_id 등.

→ 갤러리·큐레이터·작가 모두에게 동일 문의 알림 전달.

### 3.2 답변 (UPDATE) — “첫 답변만 허용”

1. **RLS**  
   - UPDATE 허용: `can_reply_to_price_inquiry(artwork_id, auth.uid()) = true` **그리고** `replied_at IS NULL`.
2. UPDATE 시 설정: `artist_reply`, `replied_at`, `replied_by_id = auth.uid()`.
3. 트리거 `notify_on_price_inquiry_reply` 수정:
   - **문의자(inquirer_id)**: 기존처럼 “가격 문의에 답변이 달렸다” 1건.
   - **작가**: 답변자가 작가가 아니면 알림 1건 (“X가 콜렉터 Y에게 작품 Z 가격을 $nnn으로 답변했습니다”).
   - **나머지 delegate**: 동일 메시지로 각 1건.

→ 한 명이 답변하면 모든 관련자(문의자 + 작가 + 다른 delegate)가 같은 답변 내용을 알림으로 받음.

### 3.3 구현 난이도·갭

- “모두에게 알림”은 **수신자 목록만 여러 명**이면 되므로 기존 notification 테이블로 가능.
- “첫 답변만”은 **RLS + CHECK 또는 트리거**로 `replied_at IS NULL`일 때만 UPDATE 허용하면 됨.
- **갭 없음**: 현재 구조만으로 구현 가능.

---

## 4. 프로비넌스 표시 (피드 vs 상세 vs 히스토리)

### 4.1 피드·공개 프로필

- 해당 작품의 클레임 중 **period_status = 'current'** 인 것만 표시.
- CREATED는 기간 없이 항상 “작가”로 표시.

### 4.2 작품 상세

- **현재 진행**: 위와 동일하게 current만 강조 표시.
- **과거·미래**: 별도 블록(예: “과거 전시/큐레이션”, “예정”) 또는 “프로비넌스 히스토리” 링크로 이동해 표시.

### 4.3 정렬/표시 순서

- current → future → past 등 명세만 정하면 됨. (추후 start_date/end_date 있으면 그걸로 세부 정렬.)

---

## 5. 연장 프로세스 (Option B — 트리거)

### 5.1 “기간 종료” 정의 (Q1 B 반영)

- **자동 종료**: `end_date`가 있는 클레임은 `end_date < today`가 되면 “종료”로 간주.
- **연장 플로우**: `end_date` 경과(또는 D-day 전 알림) 시 트리거/배치로 작가에게 “연장하시겠습니까?” 알림. 연장 시 `end_date`만 +6개월/+1년 갱신.
- **수동 종료**: `period_status`를 'current' → 'past'로 바꾸는 경우에도 동일하게 연장 알림 발송 가능(선택).

### 5.2 연장 응답 저장

- `claim_extensions` 테이블 (또는 claims에 extension 관련 컬럼):
  - claim_id, requested_at, artist_responded_at, action: 'extend_6m' | 'extend_1y' | 'decline'.
  - 연장 선택 시: 해당 claim의 `end_date`를 **오늘 기준 +6개월 또는 +1년**으로 갱신. `period_status`는 'current' 유지.
  - 거부 시: `period_status` → 'past' (가격 문의 권한 해제).

---

## 6. RLS 정리

### 6.1 price_inquiries

- **SELECT**:  
  - 문의자 본인,  
  - 또는 작가(CREATED),  
  - 또는 해당 작품의 현재 진행형 delegate.
- **INSERT**: 기존과 동일 (inquirer만).
- **UPDATE**:  
  - `replied_at IS NULL`이고,  
  - `can_reply_to_price_inquiry(artwork_id, auth.uid()) = true`인 경우만.  
  - 한 번 replied_at이 설정되면 더 이상 UPDATE 불가.

### 6.2 claims

- period_status 추가 후 기존 RLS 유지. SELECT 시 period_status 노출.

---

## 7. 알림 타입 및 메시지

| type | 수신자 | 메시지 예 |
|------|--------|------------|
| price_inquiry | 작가 + 모든 current delegate | “{inquirer}님이 작품 {title} 가격을 문의했습니다.” |
| price_inquiry_reply | 문의자 | “{replier}님이 작품 {title} 가격 문의에 답변했습니다.” |
| price_inquiry_reply | 작가(답변자 제외) | “{replier}님이 {inquirer}에게 작품 {title} 가격을 $nnn으로 답변했습니다.” |
| price_inquiry_reply | 그 외 delegate(답변자 제외) | 위와 동일 |
| claim_period_ended | 작가 | “{claim} 컨사인먼트/전시 기간이 종료되었습니다. 연장하시겠습니까?” |

---

## 8. 구현 순서 제안

1. **Phase 1 — DB**  
   - claims: `period_status` 추가, 기존 행 backfill ('current' 등).  
   - price_inquiries: `replied_by_id` 추가.  
   - notifications: 새 type 추가(필요 시).

2. **Phase 2 — 함수**  
   - `get_current_delegate_ids`, `get_price_inquiry_recipient_ids`, `can_reply_to_price_inquiry` 확장.

3. **Phase 3 — 트리거·RLS**  
   - 문의 INSERT 시 수신자 여러 명 알림.  
   - 답변 UPDATE 시 문의자 + 작가 + 다른 delegate 알림.  
   - “첫 답변만 허용” RLS/CHECK.

4. **Phase 4 — UI**  
   - **클레임 요청 시**: 요청자(갤러리/큐레이터)가 period_status(past/current/future) 선택 (제안값).  
   - **클레임 확인 시**: 작가가 period_status·start_date·end_date 확인 후 **수정 가능**하고 confirm.  
   - 피드/프로필: current만.  
   - 작품 상세: current + 히스토리(과거/미래) 링크.

5. **Phase 5 — 연장**  
   - `end_date` 경과(또는 D-day) 시 트리거/배치로 연장 알림.  
   - 연장 응답 테이블/컬럼 및 6개월/1년/거부 UI. 연장 시 `end_date` 갱신.

---

## 9. 확정 사항 요약 (갭 없음)

- **Q1 B**: optional `end_date`를 Phase 1부터 두고, 연장 시 `end_date`만 +6개월/+1년 갱신. 자동 종료는 `end_date` 기준.
- **Q2 A+B 하이브리드**: 요청자가 클레임 요청 시 period_status 선택 → 작가가 confirm 시 그대로 수락하거나 **수정** 후 확정.

**Fallback**: “문의가 모두에게 가는” 구현이 부담되면, 작가가 “가격 문의 담당자” 1명 지정 옵션으로 단순화 가능. 우선은 “모두에게 + 첫 답변 공유” 목표로 진행.
