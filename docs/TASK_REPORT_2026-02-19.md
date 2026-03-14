# 작업 보고서 — 2026-02-19 (4가지 항목)

## 1. 업로드 당사자 즉시 삭제 권한

### 현재 로직
- **`canDeleteArtwork(artwork, userId)`** (`src/lib/supabase/artworks.ts`):
  - `userId`가 없으면 `false`
  - **작가 본인**: `artwork.artist_id === userId` → 삭제 가능
  - **클레임 보유자**: `artwork.claims` 중 `subject_profile_id === userId`인 클레임이 하나라도 있으면 삭제 가능
- **싱글 업로드**: 작품 생성 직후 `createClaimForExistingArtist` RPC 호출. RPC 내부에서 `subject_profile_id = auth.uid()`(업로더)로 클레임 생성. 따라서 **업로더는 이미 클레임을 통해 삭제 권한을 가짐**.
- **벌크 업로드**: 드래프트는 `createDraftArtwork`로 `artist_id = session.user.id`로 생성되므로 업로더 = 작가 → 삭제 가능. 퍼블리시 시 `publishArtworksWithProvenance`에서 클레임 생성 → 업로더가 `subject_profile_id`로 클레임 보유.
- **RLS**: 삭제는 “작가이거나 해당 작품에 대한 클레임이 있는 경우” 등으로 허용되는 구조로 보이며, 백엔드 `deleteArtworkCascade`도 `canDeleteArtwork`와 동일 조건으로 검사.

### 결론
- 설계상 **업로드 당사자는 이미 (클레임 또는 artist_id를 통해) 삭제 가능**한 상태입니다.
- 다만 **클레임 생성이 실패하거나 아직 생성되기 전**인 극단적 구간에서는, “업로더만으로 삭제”를 허용하려면 **업로더를 별도 필드로 보존**하는 방식이 필요합니다.

### 권장 사항
- **현재 구조만 유지**: 별도 수정 없이, “업로드 당사자 = 클레임의 subject”로 삭제 가능하다고 문서화.
- **엣지 케이스까지 보장하려면**: `artworks` 테이블에 `created_by`(또는 `uploaded_by`) 컬럼 추가 후, `canDeleteArtwork`에서 `artwork.created_by === userId`인 경우에도 삭제 허용. 이 경우:
  - 새로 만드는 작품은 INSERT 시 `created_by = auth.uid()` 설정.
  - 기존 행은 마이그레이션으로 채우기 어려우면 `created_by IS NULL`일 때는 기존 로직만 적용.

**인접 기능**: 클레임/전시/정산 등은 “삭제 권한”과 별개로 동작하므로, “업로더에게 삭제 권한 추가”만으로는 인접 기능에 부작용 없음. `created_by`를 도입할 경우 RLS 정책에만 `created_by` 조건을 추가하면 됨.

---

## 2. 작품 사이즈 단위 변환 로직

### 현재 동작
- **저장**: `artworks.size`는 **문자열 하나**로만 저장됨. 예: `"30 × 40 cm"`, `"12 × 16 in"`. **입력 시 사용한 단위(cm/in)는 DB에 따로 저장하지 않음**.
- **파싱** (`src/lib/size/format.ts`):
  - `parseSize(size)`가 문자열에서 숫자만 추출해 **항상 내부적으로 cm 기준** `ParsedSize { widthCm, heightCm }`로 변환.
  - 호수(30F 등)는 cm 기준 테이블 사용.
  - "W × H cm" / "W × H in" 패턴으로 파싱 시, inch는 `* 2.54`로 cm로 환산해 저장.
- **표시** (`formatSizeForLocale(size, locale)`):
  - `parseSize`로 파싱 가능하면 → **locale이 ko면 항상 cm로 출력**, **그 외(EN)면 항상 inch로 출력** (내부 cm 기준값을 in으로 재변환).
  - 즉, **사용자가 “inch로 입력”했어도 DB에는 이미 cm 환산된 값만 있고, 표시 시 locale에 따라 다시 cm 또는 in으로 출력**하는 구조. “사용자 입력 단위”는 보존되지 않음.

### 요구사항 정리
- **참값**: 사용자가 입력한 값(단위 포함)을 **그대로 참값**으로 간주.
- **저장**: 입력 문자열을 **그대로** 저장하되, **표시용이 아닌 “원 단위”를 알 수 있어야 함** (또는 저장 시 단위 메타데이터 추가).
- **표시**:
  - 사용자가 **inch**로 입력 → 기본은 inch로 표시, **KO 환경에서만** cm로 **변환 표시**.
  - 사용자가 **cm**로 입력 → 기본은 cm로 표시, **EN 환경에서만** inch로 **변환 표시**.

### 문제점
- 현재는 **입력 단위를 저장하지 않고**, 파싱 결과를 **항상 cm 기준**으로만 쓰고, 표시 시 locale로 cm/in을 결정합니다. 따라서 “사용자가 inch로 입력했는지, cm로 입력했는지”를 구분할 수 없습니다.

### 제안 (최소 스키마 변경)
- **옵션 A — 저장 형식 확장 (권장)**  
  - `artworks.size`는 그대로 두고, **`artworks.size_unit`** 같은 컬럼을 추가: `"cm" | "in" | null`.
  - 규칙:
    - 사용자가 "W × H cm" 형태로 입력 → `size`에 문자열 저장, `size_unit = "cm"`.
    - "W × H in" 형태로 입력 → `size`에 문자열 저장, `size_unit = "in"`.
    - 호수 등 파싱만 가능한 경우 → `size_unit = "cm"` (호수 테이블이 cm 기준이므로).
    - 기존 데이터는 `size_unit = null` → 기존처럼 `formatSizeForLocale`에서 locale만 보고 cm/in 결정 (하위 호환).
  - **표시**:
    - `size_unit === "in"`: KO일 때만 숫자 파싱 후 cm로 변환해 "○ × ○ cm"로 표시; EN이면 입력값 그대로(또는 포맷만 정리) inch로 표시.
    - `size_unit === "cm"`: EN일 때만 숫자 파싱 후 inch로 변환해 "○ × ○ in"으로 표시; KO면 그대로 cm로 표시.
  - 업로드/수정 폼에서 파싱 결과에 따라 `size_unit`을 설정해 저장하도록 수정.

- **옵션 B — 스키마 변경 없이 문자열만 사용**  
  - `size` 문자열에 **단위를 접두/접미로 고정 형식**으로 포함 (예: `"in:12×16"`, `"cm:30×40"`).  
  - 표시 시 접두어를 파싱해 위와 같은 변환 규칙 적용.  
  - 기존 데이터는 패턴이 없으면 기존 로직으로 fallback.  
  - 단점: 기존 데이터와 형식이 혼재하고, 호수/자유 텍스트와의 일관성 설계가 필요함.

**권장**: 옵션 A (`size_unit` 추가). 마이그레이션에서 기존 `size`만 있는 행은 `size_unit = null`로 두고, 새로 저장하는 값부터 단위를 저장. `formatSizeForLocale`와 업로드/수정 폼을 위 규칙에 맞게 수정.

---

## 3. 피드 무한 스크롤 / 더 불러오기

### 현재 로직
- **`FeedContent`** (`src/components/FeedContent.tsx`):
  - **한 번에 로드**: `listPublicArtworks({ limit: 50, sort })` 또는 `listFollowingArtworks({ limit: 50 })`, `listPublicExhibitionsForFeed(30)` 등으로 **고정 limit**만 사용. **cursor/offset 기반 페이지네이션 없음**.
  - **탭/정렬**: `tab`(all | following), `sort`(latest | popular)에 따라 위 API 한 번만 호출.
  - **Discovery(사람 추천)**: `fetchRecProfiles`로 프로필 목록 가져온 뒤, 각 프로필당 `listPublicArtworksForProfile(limit: 3)`로 작품 불러와 피드에 인터리브. **추가 로드 없음**.
  - **“더 보기”/스크롤 이벤트**: 없음. 스크롤 끝에 도달해도 추가 요청하지 않음.
- **API** (`listPublicArtworks` 등): `limit`만 받고, `created_at` 기준 `order` 후 `limit`만 적용. **cursor(예: `created_at`, `id`) 파라미터 미지원**.

### 요구사항
- 탭/정렬 유지.
- 스크롤이 **맨 아래**에 도달하면 추가 데이터 로드 (작품·전시·사람 추천).
- 피드가 너무 느려지지 않도록 유지.

### 제안
1. **백엔드**
   - `listPublicArtworks`, `listFollowingArtworks`, 전시 피드용 리스트 등에 **cursor 기반 페이지네이션** 추가:
     - 예: `after_created_at`, `after_id` (또는 `cursor`)를 받아 `WHERE (created_at, id) < (cursor_created_at, cursor_id) ORDER BY created_at DESC, id DESC LIMIT n`.
   - 응답에 **next_cursor** (다음 페이지가 있으면 `created_at`+`id` 등) 포함.

2. **프론트**
   - `FeedContent`에서:
     - 첫 로드는 기존처럼 `limit: 20`(또는 30)으로 수행.
     - **스크롤 끝 감지**: 컨테이너에 `IntersectionObserver` 또는 “맨 아래” ref + 스크롤 이벤트로 “footer” 요소가 보이면 `loadMore()` 호출.
     - `loadMore()`: `next_cursor`가 있을 때만 다음 페이지 요청하고, 기존 `feedEntries`에 append. `loadingMore` 상태로 중복 요청 방지.
   - **Discovery**: 첫 로드에서만 N명 추천 + 각 3점. “더 보기” 시에는 같은 `fetchRecProfiles` 캐시에서 다음 프로필을 가져오거나, `offset`/`cursor`가 있다면 다음 추천 프로필 페이지를 요청해 추가 블록 삽입.

3. **성능**
   - 한 번에 불러오는 개수는 20~30 수준 유지.
   - 스크롤 끝에서만 로드해 초기 렌더 비용 제한.
   - 필요 시 가상 스크롤(react-window 등)은 데이터가 매우 많아진 뒤 검토.

이렇게 하면 “전체-최신” 등 탭은 그대로 두고, 스크롤 시 추가 로드만 붙이는 형태로 확장할 수 있습니다.

---

## 4. 벌크/전시 업로드 시 작가 이름 1글자 입력 시 즉시 다음 단계로 이동

### 원인
- **벌크 업로드** (`src/app/upload/bulk/page.tsx`):
  - 다음 단계 표시 여부가 **상태만으로** 결정됨.
  - `showMain = intent !== null && (!needsAttribution || selectedArtist !== null || (useExternalArtist && externalArtistName.trim()))`
  - 즉, “외부 작가” 모드에서 **`externalArtistName.trim()`이 한 글자만 있어도 truthy**이므로 `showMain === true`가 되어, **버튼 없이 즉시** 업로드 영역이 보임.
- **싱글 업로드** (`src/app/upload/page.tsx`):
  - “다음” 버튼으로 `handleAttributionNext()` 호출.
  - 이 함수는 `useExternalArtist`일 때 `externalArtistName.trim()`만 검사하므로, **한 글자만 있어도 통과**해 `setStep("form")` 실행.

### 해결 방안
- **외부 작가 이름**에 **최소 길이(예: 2자)** 를 요구:
  - 벌크: `showMain` 조건에서 `(useExternalArtist && externalArtistName.trim())` → `(useExternalArtist && externalArtistName.trim().length >= 2)` 로 변경.
  - 싱글: `handleAttributionNext`에서 `externalArtistName.trim()` 검사 시 `externalArtistName.trim().length >= 2` 추가.
  - 벌크 퍼블리시 시 검증(toast "Artist name required")도 동일하게 `length >= 2`로 통일.

이렇게 하면 한 글자만 입력했을 때는 다음 단계로 넘어가지 않고, 인접한 “작가 검색 선택” 플로우는 기존대로 유지됩니다.
