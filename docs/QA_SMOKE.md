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
- [ ] 삭제 후 `/my`로 리다이렉트
- [ ] 피드·프로필·내 작품 목록에서 해당 작품 제거
- [ ] Storage에서 해당 이미지 파일 제거

### 2.2 단일 작품 삭제 (visitor)
- [ ] 다른 사용자 작품 상세 페이지 → Delete 버튼 미노출

### 2.3 /my 카드에서 삭제 + bulk delete
- [ ] `/my` → 내 작품 카드 Delete → 확인 → 삭제
- [ ] 목록 갱신 + "Artwork deleted" 토스트
- [ ] Bulk delete: `/my` → Select → 체크박스로 여러 개 선택 → Delete selected → 확인 ("Delete N posts?") → N개 삭제, storage 정리 확인

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

## 4. People (3-lane recs + Search)

- [ ] `/artists` 접속 시 `/people`로 redirect
- [ ] q 없이 `/people` 진입: 3-lane 추천 (From people you follow / Based on what you like / A bit different)
- [ ] lane 전환 시 결과 바뀌는지
- [ ] roles 필터 적용되는지, URL 유지
- [ ] Load more 클릭 시 +10명 추가
- [ ] q 입력 시 Search 모드로 전환, debounced 검색 동작
- [ ] search 0건: "No results" + filter reset CTA
- [ ] lane 추천 0건: "No recommendations yet" + Try search CTA

## 5. Feed (Following + interleave)

- [ ] Following 탭: 팔로우한 아티스트 작품 스트림
- [ ] 조건 충족 시 (score>=2) Recommended 프로필 카드가 5개당 1개씩 간헐적으로 삽입되는지
- [ ] 추천 카드 클릭 → /u/[username] 이동
- [ ] 추천 카드에서 Follow 버튼 동작 확인
- [ ] All 탭: 단일 스트림 (Latest/Popular)

---

## 6. Profile details save + persona sections

- [ ] **Roles=collector**: Collector module만 표시, mediums/styles 비워도 저장 성공
- [ ] **Roles=collector**: price_band + themes + acquisition_channels 입력 후 저장 성공
- [ ] **Roles=artist**: Artist module 표시, mediums/styles/themes 입력 후 저장 성공
- [ ] **Education**: 빈 row가 있어도 저장 실패하지 않음 (빈 row drop)
- [ ] **Year**: year='' 입력되어도 null로 저장 (에러 없음)
- [ ] **i18n**: EN/KO 모두 taxonomy/섹션 라벨 표시
- [ ] **Max select**: themes 5개 초과 시 "You can select up to 5" 메시지
- [ ] **Dev**: 저장 실패 시 콘솔에 payload + error detail 노출

## 7. Profile v0 + Completeness

- [ ] `/settings`에서 Profile details 펼치기 → Core + 역할별 모듈 표시
- [ ] 저장 후 completeness 진행 바 증가 확인 (0이 아님)
- [ ] `/my`에서 "Profile completeness: X/100" 카드 노출
- [ ] "Improve profile" 클릭 시 /settings 이동
- [ ] 동일 city 또는 shared themes 설정 시 `/people` Recommended에서 "Why recommended" 라인에 Same city / Shared themes 표시

## 8. AI Recs v0 (embeddings / taste profile 유지)

- [ ] 좋아요 클릭 → taste profile 업데이트 (user_taste_profiles debug liked_count 증가)
- [ ] People에서 3-lane 추천 (follow_graph / likes_based / expand)
- [ ] embeddings null 상태에서도 fallback 동작

## 8.5 My Profile (/my) + Followers/Following

- [ ] Header에서 "My Profile" 클릭 → `/my` 진입
- [ ] `/my` KPIs: Following, Followers, Posts 숫자 표시
- [ ] Following 클릭 → `/my/following` (내가 팔로우한 사람 목록)
- [ ] Followers 클릭 → `/my/followers` (나를 팔로우한 사람 목록)
- [ ] 프로필 completeness가 설정 저장 후 0이 아님

## 9. Profile Viewers (Entitlements skeleton)

- [ ] 내 프로필 `/u/<me>` 접속 시 (다른 계정으로) profile_views 이벤트 기록 (로그인 기준)
- [ ] `/me`에서 "Profile views (last 7 days)" 카드 노출, count 증가
- [ ] plan=free: viewer list 숨김, "Upgrade to see who viewed you" CTA만
- [ ] plan=artist_pro (entitlements row 수동 업데이트): viewer list 10명 노출

## 10. i18n

### Cookie persist

- [ ] Header에서 locale 토글 (EN ↔ KO)
- [ ] 페이지 새로고침 후에도 선택한 locale 유지
- [ ] `ab_locale` 쿠키 존재 확인 (개발자 도구 → Application → Cookies)

---

### People + insights keys
- [ ] people.lanes.followGraphTitle, people.lanes.likesBasedTitle, people.lanes.expandTitle
- [ ] people.reason.followGraph, people.reason.likesBased, people.reason.expand
- [ ] people.noRecommendations, people.noSearchResults
- [ ] insights.profileViewsTitle, insights.last7Days, insights.upgradeToSeeViewers
- [ ] insights.recentViewers, insights.noViewsYet, insights.seeAll

## 11. Migration Guard (개발 환경)

- [ ] migrations 미적용 시: 콘솔 경고 + 토스트 "Supabase migration not applied: ..."
- [ ] 프로덕션: 토스트 미표시, console.error만 (Sentry 연동 시 추적 가능)
