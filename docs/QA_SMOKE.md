# QA Smoke Test Checklist

문서 기반 체크리스트. 배포 후 또는 주요 변경 후 수동 검증용.

## 사전 조건
- [ ] Supabase migrations 적용됨 (MigrationGuard 토스트 없음, 또는 적용 완료 확인)
- [ ] 로그인된 테스트 계정 2개 (owner / visitor)

---

## 1. Bulk Upload

### 1.1 Pending remove
- [ ] `/upload/bulk` → 파일 여러 개 선택 → 대기 목록에 표시
- [ ] 개별 × 클릭 시 해당 파일만 대기 목록에서 제거
- [ ] Clear 클릭 시 전체 대기 목록 비움
- [ ] 업로드 시작 전에 제거한 파일은 업로드되지 않음

### 1.2 Draft upload
- [ ] 대기 목록에서 Upload 클릭 → 각 파일별 draft 생성 + 이미지 업로드
- [ ] 업로드 완료 후 draft 테이블에 행 표시 (썸네일, 제목 등)
- [ ] 에러 시 해당 아이템만 실패, 나머지 계속 처리

### 1.3 Delete selected / Delete all
- [ ] draft 여러 개 선택 → Delete selected → 선택된 draft만 삭제
- [ ] Delete all → 전체 draft 삭제
- [ ] 삭제 후 DB/Storage에서 해당 레코드·파일 제거 확인 (Storage 콘솔에서 orphan 없음 권장)

### 1.4 Publish
- [ ] 필수 필드(title, ownership, pricing, 이미지 1개+) 미충족 시 Publish 버튼 비활성
- [ ] 필수 필드 충족 시 Publish → public 전환
- [ ] 발행 후 draft 목록에서 사라지고 피드/프로필에 노출

---

## 2. Artwork Delete

### 2.1 단일 작품 삭제 (owner)
- [ ] `/artwork/[id]` (본인 작품) → Delete → 확인 모달 → 삭제
- [ ] 삭제 후 `/me`로 리다이렉트
- [ ] 피드·프로필·내 작품 목록에서 해당 작품 제거
- [ ] Storage에서 해당 이미지 파일 제거

### 2.2 단일 작품 삭제 (visitor)
- [ ] 다른 사용자 작품 상세 페이지 → Delete 버튼 미노출

### 2.3 /me 카드에서 삭제
- [ ] `/me` → 내 작품 카드 Delete → 확인 → 삭제
- [ ] 목록 갱신 + "Artwork deleted" 토스트

---

## 3. Reorder Persist

### 3.1 저장 성공
- [ ] `/u/<본인 username>` → Reorder → 드래그로 순서 변경 → Save
- [ ] 새로고침 후에도 변경된 순서 유지
- [ ] 다른 사용자가 프로필 방문 시 동일 순서로 표시

### 3.2 저장 실패 시 UX
- [ ] Save 실패 시(예: 네트워크 오류) reorder 모드 유지
- [ ] 현재 순서 롤백 없음
- [ ] 실패 메시지 토스트 + Retry 버튼 표시
- [ ] Retry 클릭 시 재시도

### 3.3 Reorder 버튼 visibility
- [ ] 본인 프로필에서만 Reorder 버튼 표시
- [ ] visitor 프로필에서는 Reorder 버튼 미표시

---

## 4. i18n Cookie Persist

- [ ] Header에서 locale 토글 (EN ↔ KO)
- [ ] 페이지 새로고침 후에도 선택한 locale 유지
- [ ] `ab_locale` 쿠키 존재 확인 (개발자 도구 → Application → Cookies)

---

## 5. Migration Guard (개발 환경)

- [ ] migrations 미적용 시: 콘솔 경고 + 토스트 "Supabase migration not applied: ..."
- [ ] 프로덕션: 토스트 미표시, console.error만 (Sentry 연동 시 추적 가능)
