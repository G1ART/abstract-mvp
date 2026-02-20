# 전시(exhibition) 기능 구현 — 최종 검토

## 1. 범위 (이번 구현)

| 구분 | 내용 |
|------|------|
| **DB** | `exhibition_works` 테이블 + RLS + 인덱스. `venues` / `projects.venue_id`는 별도 단계에서 추가 가능(현재는 `host_profile_id`로 “우리 공간 전시” 조회). |
| **API** | 전시(project) CRUD(이미 테이블·RLS 있음), 전시에 작품 추가(exhibition_works INSERT + 선택 시 pending 클레임), 전시에서 작품 제거(exhibition_works DELETE만, D6). |
| **UI** | My 프로필 첫 탭: 큐레이터/갤러리 = “기획한 전시”/“진행 중인 전시” + 전시 만들기. 전시 생성/편집 플로우에서 “기존 작품 선택” + “새 작품 업로드” 동시 지원(D4-2). 전시 상세에서 작품 추가/제거. |
| **정책** | 작품 제거 시 exhibition_works만 삭제, 클레임은 유지(D6). |

## 2. 기존 레이어와의 정합성

- **claims**: work_id XOR project_id 유지. 전시에 작품 넣을 때는 work 단위 claim(EXHIBITED/CURATED) 생성, exhibition_works는 “이 전시에 이 작품 포함”만 표현.
- **get_current_delegate_ids / 가격 문의**: 변경 없음.
- **personaTabs**: 현재 all / CREATED / OWNS / INVENTORY / CURATED. 큐레이터/갤러리 첫 탭을 “전시”로 두려면 탭 타입 확장(예: `exhibitions`) 및 전시 목록 데이터 소스(projects where curator_id/host_profile_id = me) 필요.
- **projects**: 이미 존재. 전시 = project_type = 'exhibition'. RLS는 curator_id = auth.uid()로 insert/update/delete.

## 3. 구현 순서

1. **마이그레이션**: `p0_exhibition_works.sql` (테이블, RLS, 인덱스). ✅
2. **API/클라이언트**: `src/lib/supabase/exhibitions.ts` — listMyExhibitions, createExhibition, updateExhibition, getExhibitionById, listWorksInExhibition, addWorkToExhibition, removeWorkFromExhibition. ✅ (pending 클레임 생성은 전시 작품 추가 UI에서 createClaimRequest 등 기존 RPC 호출로 처리 가능.)
3. **UI**: My 페이지 전시 탭(큐레이터/갤러리), 전시 만들기/편집, 전시 상세(작품 목록 + 추가/제거). — 다음 단계.

## 4. 충돌 가능성

- **없음**: exhibition_works는 신규 테이블, projects/claims 제약 변경 없음. 기존 업로드·클레임 RPC 재사용만 하면 됨.
