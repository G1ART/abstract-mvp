# 가격 문의 고도화 요구사항 분석 및 논리적 갭

## 현재 구조

### Claims 테이블
- `claim_type`: CREATED, OWNS, INVENTORY, CURATED, EXHIBITED 등
- `status`: pending, confirmed
- `created_at`: 클레임 생성 시각
- **기한 관련 컬럼 없음**

### Price Inquiries
- 현재: CREATED 클레임 보유자(작가)에게만 문의 전달
- `price_inquiry_artist_id()` 함수가 CREATED 클레임만 조회

## 요구사항 요약

1. **클레임에 기한 추가** (start_date, end_date, optional)
2. **현재 진행형 클레임 보유자에게 가격 문의 라우팅** (CURATED/INVENTORY)
3. **작가는 알림으로만 확인** (읽기 전용)
4. **기간 종료 시 연장 프로세스** (6개월/1년 옵션)

## 논리적 갭 및 해결 방안

### 1. 여러 현재 진행형 클레임이 동시에 존재할 경우

**문제**: 한 작품에 큐레이터 A와 갤러리 B가 동시에 현재 진행형 클레임을 가질 수 있음

**옵션 A: 우선순위 기반**
- INVENTORY > CURATED > EXHIBITED 순서
- 가장 높은 우선순위 클레임 보유자에게 문의 전달
- **장점**: 명확한 규칙, 구현 간단
- **단점**: 실제로는 큐레이터가 더 적합할 수도 있음

**옵션 B: 가장 최근 시작일**
- `start_date`가 가장 최근인 클레임 보유자에게 전달
- **장점**: 최신 계약 우선
- **단점**: 계약 시작일과 실제 권한이 다를 수 있음

**옵션 C: 사용자 선택 (권장)**
- 작가가 클레임 생성/확인 시 "가격 문의 담당자" 플래그 설정
- 한 번에 하나만 활성화 가능
- **장점**: 작가가 실제 상황에 맞게 결정 가능
- **단점**: 추가 UI/UX 필요

**추천**: 옵션 C (작가가 명시적으로 지정) + 옵션 A (fallback)

### 2. 기간 설정의 유연성

**문제**: 정확한 종료일을 모를 때, 또는 "진행 중" 상태

**해결 방안**:
- `start_date`: 필수 (또는 클레임 생성일)
- `end_date`: NULL 가능 (진행 중 = NULL)
- `period_status`: 'past' | 'current' | 'future' | 'indefinite' (계산 필드 또는 저장)
- UI에서 "종료일 미정" 옵션 제공

### 3. "현재 진행형" 판단 로직

**조건**:
- `status = 'confirmed'`
- `start_date <= NOW()`
- `end_date IS NULL OR end_date >= NOW()`
- `claim_type IN ('CURATED', 'INVENTORY', 'EXHIBITED')`

**함수**: `get_active_price_inquiry_claim(artwork_id)` → 가장 우선순위 높은 클레임 반환

### 4. 가격 문의 라우팅 로직

**새 함수**: `price_inquiry_recipient_id(artwork_id)`
```sql
-- 1. 활성화된 INVENTORY/CURATED/EXHIBITED 클레임이 있으면 그 보유자
-- 2. 없으면 CREATED 클레임 보유자 (작가)
```

### 5. 연장 프로세스

**트리거/스케줄러**:
- 매일 `end_date = TODAY - 1`인 confirmed 클레임 확인
- 작가에게 알림: "컨사인먼트 기간 종료 예정/종료됨"
- 연장 옵션: 6개월, 1년, 거부

**상태 관리**:
- `extension_pending`: 종료 예정 알림 보냄, 아티스트 응답 대기
- `extended`: 연장됨 (새 end_date 설정)
- `expired`: 연장 거부 또는 응답 없음 → 가격 문의 권한 해제

### 6. 작가 알림 (읽기 전용)

**새 알림 타입**:
- `price_inquiry_to_delegate`: "콜렉터 A가 큐레이터 B에게 작품 X 가격 문의"
- `price_inquiry_reply_by_delegate`: "큐레이터 B가 콜렉터 A에게 작품 X 가격 $nnn 답변"

**권한**:
- 작가는 `price_inquiries` 테이블 SELECT 가능 (자신의 작품에 대한 모든 문의)
- UPDATE 불가 (답변은 delegate만 가능)

### 7. 클레임 타입별 처리

**INVENTORY**: 갤러리 인벤토리 (컨사인먼트)
**CURATED**: 큐레이터가 큐레이팅/전시
**EXHIBITED**: 전시 프로젝트 연결

**질문**: EXHIBITED도 가격 문의 권한을 가져야 하나?
- 옵션 A: INVENTORY/CURATED만 (갤러리/큐레이터가 실제 판매 권한)
- 옵션 B: EXHIBITED도 포함 (전시 중인 작품도 해당 갤러리에서 판매 가능)

**추천**: 옵션 A (INVENTORY/CURATED만)

## 구현 단계

### Phase 1: DB 스키마 확장
1. `claims` 테이블에 `start_date`, `end_date`, `is_price_inquiry_delegate` 컬럼 추가
2. `price_inquiries` 테이블에 `delegate_id` 컬럼 추가 (답변한 사람)
3. `claim_extensions` 테이블 (연장 요청/응답 추적)

### Phase 2: 함수 및 RLS 업데이트
1. `get_active_price_inquiry_claim(artwork_id)` 함수
2. `price_inquiry_recipient_id(artwork_id)` 함수 (기존 함수 대체)
3. RLS 정책 업데이트 (delegate가 답변 가능하도록)

### Phase 3: 알림 시스템 확장
1. 새 알림 타입 추가
2. 트리거 업데이트 (delegate에게 문의, 작가에게 알림)

### Phase 4: UI/UX
1. 클레임 생성/확인 시 기한 입력 UI
2. 가격 문의 블록 (delegate용)
3. 연장 알림 및 UI

### Phase 5: 연장 프로세스
1. 스케줄러/트리거로 종료 예정 감지
2. 연장 UI 및 로직

## 결정 필요 사항

1. **여러 활성 클레임 우선순위**: 옵션 C (작가 지정) + 옵션 A (fallback) 추천
2. **EXHIBITED 포함 여부**: INVENTORY/CURATED만 추천
3. **기간 필수 여부**: start_date 필수, end_date optional (진행 중 = NULL)
4. **연장 자동화**: 매일 스케줄러 vs 트리거 (트리거 추천, end_date 업데이트 시점에 체크)
