# 검색 강화 설계 — 오타·유사어·다중 신호

작가/작품 이름을 잘 모르거나 오타가 났을 때도 포괄적으로 유용한 검색을 위한 접근과 선택지 정리.

---

## 1. 벤치마킹 요약

### PostgreSQL 옵션

| 방식 | 장점 | 단점 | 적합한 용도 |
|------|------|------|-------------|
| **pg_trgm** (trigram) | 오타·유사 철자 허용, 이름/단어 변형에 강함, 인덱스(GIN) 지원 | 단어 단위 의미 검색은 아님 | 이름·유저네임·작품 제목·매체 등 **짧은 문자열** |
| **Full-Text Search** (tsvector) | 어간 추출(stemming), 자연어 질의 | **오타 허용 안 함** (정확한 단어 일치) | 긴 본문·설명 검색 |
| **LIKE/ilike** | 단순, 예측 가능 | 선행 와일드카드 시 풀 스캔, 오타 불가 | 현재 구현; 퍼지와 병행 가능 |

**결론:** 작가명·작품명·테마처럼 **이름을 모르거나 오타가 나는 경우**에는 **pg_trgm**이 적합. FTS는 “자연어 문장 검색”에 두고, 1차 검색 강화는 **pg_trgm**으로 진행.

### 인프라

- **Supabase:** `CREATE EXTENSION IF NOT EXISTS pg_trgm` 지원.
- **추가 서비스(Elasticsearch/Algolia 등):** MVP에서는 불필요. PostgreSQL만으로 구현 후, 규모 확대 시 전용 검색 엔진 검토.

---

## 2. 적용 범위

| 영역 | 현재 | 강화 후 |
|------|------|---------|
| **People — 이름/유저네임** | ilike `%q%` | ilike **+ pg_trgm similarity** (오타·유사 철자 허용) |
| **People — 작품/테마** | 없음 | **작품 title/medium/story**로 매칭 → 해당 **아티스트** 반환 (ilike + 선택적 trigram) |
| **전시 작품 추가** | 큐레이터 풀 + workQuery(클라이언트 필터) | 참여 작가 있으면 **선정 작가 공개 작품** 풀 + 동일 workQuery (§9.2) |
| **메인 피드 자연어 검색** | 없음 | 추후 별도 (§9.3) |

---

## 3. 선택지 및 결정

### 3.1 퍼지 검색 유사도 임계값 (pg_trgm)

- **similarity(a, b)** 는 0~1. 값이 클수록 더 유사.
- **선택지:** 0.1(관대) / 0.2(권장) / 0.3(엄격).
- **결정:** 기본 **0.2** 사용. ilike 매칭은 항상 포함하고, 그 외에 similarity > 0.2인 항목을 추가해 노출.

### 3.2 People 검색 페이지네이션

- 퍼지 정렬(similarity desc)에서는 **키셋 커서(id 기반)** 를 쓰기 어렵다.
- **선택지:** (A) 검색 시 **첫 페이지만** (예: 30~40건), “더보기” 없음. (B) offset 기반 “더보기”. (C) ilike만 커서, 퍼지는 첫 페이지만 병합.
- **결정:** (A) — 검색 결과는 **최대 40건** 반환, 커서 없음. “이름/테마로 찾기” 용도로는 충분.

### 3.3 이름 검색 vs 작품 검색 결과 병합

- **선택지:** (A) 한 입력창에서 **이름 검색 + 작품 검색 동시 호출** 후 **id 기준 병합·중복 제거**. (B) 탭/토글로 “이름으로 / 작품·테마로” 전환.
- **결정:** (A). 한 번에 두 종류 결과를 섞어서 보여 주는 쪽이 UX 상 유리.

### 3.4 작품 기반 아티스트 검색 매칭 방식

- **선택지:** (A) **ilike만** (제목·매체·스토리). (B) **ilike + pg_trgm** (오타 허용).
- **결정:** (B). “달항아리” 오타나 “abstract painting” 변형까지 포괄하려면 퍼지 포함.

---

## 4. 구현 요약

1. **마이그레이션**
   - `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
   - **search_people** 수정: `(username ilike v_pattern or display_name ilike v_pattern) or similarity(username, q) > 0.2 or similarity(display_name, q) > 0.2`. 정렬: exact(ilike) 우선, 그 다음 similarity desc. limit 40, 커서 없음(반환 시 nextCursor null).
   - **search_artists_by_artwork** 신규: artworks(visibility=public)에서 title/medium/story에 ilike 또는 similarity > 0.15 매칭 → distinct artist_id → profiles 조인, 역할 필터, search_people과 동일한 jsonb 스키마. limit 20.
2. **People 클라이언트**
   - 검색 시 `search_people` + `search_artists_by_artwork` 둘 다 호출 → id 기준 병합·중복 제거 → 한 목록으로 표시. nextCursor는 이름 검색만 지원(있으면 사용) 또는 검색 시 항목 null로 “더보기” 비표시.
3. **i18n**
   - placeholder: “이름, @유저네임 또는 작품·테마로 검색” 등.
4. **전시 작품 추가 (§9.2)**
   - 참여 작가 1명 이상이면 선정 작가 공개 작품만 풀로 조회, 기존 workQuery(제목·매체·스토리) 필터 유지. “새 작품 업로드” 흐름은 변경 없음.

---

## 5. 궁금한 점·추가 선택지

- **한글/다국어:** pg_trgm은 문자 단위이므로 한글도 동작. 다만 한글 형태소 단위 검색이 필요하면 추후 FTS + 한글 사전 검토.
- **“Did you mean?”:** 결과가 없거나 적을 때 유사어 제안은 현재 범위 외. 추후 검색 로그 기반 제안 도입 가능.
- **검색 결과 순위 가중치:** 이름 정확 일치 > 유저네임 정확 일치 > 이름 퍼지 > 작품 기반 등으로 가중치를 둘 수 있음. 1차 구현에서는 이름 검색(ilike+similarity)과 작품 검색 결과를 단순 병합.

위 결정으로 구현 진행. 변경 원하면 알려 주세요.

---

## 6. 구현 완료 체크리스트

- [x] `p0_search_fuzzy_pg_trgm.sql` 마이그레이션 추가 (pg_trgm, search_people 퍼지, search_artists_by_artwork, GIN 인덱스).
- [x] `peopleRecs`: searchArtistsByArtwork, searchPeopleWithArtwork 추가.
- [x] People 페이지: searchPeopleWithArtwork 사용, placeholder/빈 결과 i18n 반영.
- [x] 전시 작품 추가: 참여 작가 있으면 선정 작가 공개 작품 풀 사용, 안내 문구 추가.
- [ ] **Supabase SQL Editor에서 `p0_search_fuzzy_pg_trgm.sql` 수동 실행** (프로젝트 규칙상 마이그레이션 자동 적용 없음).
