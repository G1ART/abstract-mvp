# 전시 작품 추가 — 작가 단위 버킷 + 드래그앤드롭 설계

## 요구사항 요약

- 전시 게시물 생성 후 참여 작가가 이미 정해진 상태(개인전 1명, 다인전 n명)에서, **작가 단위 버킷**으로 UI를 재구성.
- 각 작가 버킷에서:
  1. **드래그앤드롭**: 이미지 파일 1점 → 단일 업로드, n점 → 벌크 업로드로 넘어가며 해당 작가가 이미 선택된 상태.
  2. **버튼**: "단일 작품 추가", "벌크 작품 추가" (기존 링크와 동일, 해당 작가로).

## 검토 결과: 가능 여부·충돌

| 항목 | 결론 |
|------|------|
| **로직 충돌** | 없음. 기존 "기존 작품 그리드에서 Add"는 그대로 두고, **추가**만 함. |
| **기능 충돌** | 없음. 삭제·전시 편집·위임 등과 독립. |
| **드롭한 파일 전달** | URL로는 File 전달 불가 → **같은 탭 내 메모리 스토어**로 전달 후 이동. 이동한 페이지 마운트 시 스토어에서 꺼내서 사용 후 비움. |
| **단일/벌크 페이지** | 이미 `from=exhibition`·`artistId`(또는 external) 지원 → 스토어에서 파일만 보충하면 됨. |

## 설계

### 1. Pending 파일 스토어 (같은 탭 전용)

- **역할**: add 페이지에서 드롭한 `File[]`을 임시 보관하고, upload/bulk 페이지로 이동한 뒤 마운트 시 한 번만 읽어서 사용 후 비움.
- **위치**: `src/lib/pendingExhibitionUpload.ts` (모듈 레벨 변수 + getter/setter).
- **형식**: `{ exhibitionId, artistId?, artistName?, artistUsername?, externalName?, externalEmail?, files: File[] }`. image/* 만 허용.
- **한계**: 새 탭에서 업로드 페이지를 열면 파일 없음 → 사용자가 직접 선택. 동일 탭 내에서만 DnD → 업로드 플로우가 유지됨.

### 2. 작품 추가(works) 단계 UI 재구성

- **순서**: 상단에 "작가 버킷" 블록, 그 아래 "기존 작품 선택" (필터 + 그리드) 유지.
- **작가 버킷** (participants + external rows 각 1개):
  - **제목**: 작가 이름 (참여: display_name || @username, 외부: name).
  - **드롭 존**:  
    - `onDragOver` → `preventDefault`.  
    - `onDrop` → image 파일만 수집.  
      - 1개: `setPendingExhibitionFiles(...)` 후 `router.push(/upload?addToExhibition=...&from=exhibition&artistId=...)` (또는 external 쿼리).  
      - 2개 이상: 동일하게 스토어 세팅 후 `router.push(/upload/bulk?...)`.
  - **버튼**: "단일 작품 추가" (Link), "벌크 작품 추가" (Link) — 기존과 동일 URL.
- **기존 작품 선택**: 지금처럼 필터(전체/작가별) + 검색 + 그리드 + Add 버튼. 변경 없음.

### 3. 단일 업로드 페이지

- 마운트 시: `from=exhibition`이고 `getAndClearPendingExhibitionFiles()`가 1개 파일 반환하며 exhibitionId(·artistId 또는 external)가 현재 URL과 일치하면:
  - `setImage(file)`, `setStep("form")` (이미 intent·작가/외부는 쿼리로 채워져 있음).

### 4. 벌크 업로드 페이지

- 마운트 시: `from=exhibition`이고 `getAndClearPendingExhibitionFiles()`가 1개 이상 파일 반환하며 exhibitionId 일치하면:
  - 해당 파일들을 `pendingFiles` 상태에 추가 (id 생성), 스토어는 비움.  
  - 외부 작가면 URL에 externalName/externalEmail 있음 → bulk는 이미 artistId 기반 preselected만 지원하므로, **외부 작가 DnD**는 이번 스코프에서 URL만 넘기고, 파일만 스토어로 전달. (외부 작가 버킷에서 드롭 시 URL에 externalName, externalEmail 포함.)

### 5. 외부 작가 버킷

- participant가 아닌 "외부 작가" 행(name 있음)도 버킷 1개로 표시.
- 드롭/버튼 시 쿼리: `externalName`, `externalEmail` (artistId 없음).  
- 단일 업로드: 이미 `preselectedExternalName` 등 지원.  
- 벌크: 현재는 `artistId` 기반 preselected만 있음 → **외부 작가 DnD 시** 벌크 URL에 `externalName`, `externalEmail` 추가하고, bulk 페이지에서 이 쿼리 읽어서 `useExternalArtist=true`, `externalArtistName`, `externalArtistEmail` 세팅. (이건 기존에 없을 수 있음 — bulk에 external preselected 추가.)

## 구현 순서 (완료)

1. `src/lib/pendingExhibitionUpload.ts` — get/set/clear, image/* 만 허용, exhibitionId·artistId·externalName 매칭.
2. add 페이지 works 단계 — 작가 버킷(참여 작가 + 외부 작가 행) 각각: 제목, 드롭 존(1점→단일, 2점 이상→벌크), "단일 작품 추가"·"벌크 작품 추가" 버튼. 참여 작가 없으면 "1단계에서 작가 추가" 안내 + step artists로 복귀.
3. 단일 업로드 페이지 — 마운트 시 `getAndClearPendingExhibitionFiles`로 1개 파일 있으면 `setImage(file)`, `setStep("form")`.
4. 벌크 페이지 — 마운트 시 pending 파일 있으면 `pendingFiles`에 추가. URL에 `externalName`·`externalEmail` 있으면 `useExternalArtist`·`attributionStepDone` 세팅(외부 작가 버킷 DnD/버튼 지원).
5. i18n: `exhibition.addWorksByArtist`, `exhibition.dropImagesHere`, `exhibition.addArtistsFirst` (한/영).
