# 전시 작품 추가 — 작가 중복 선택 루프 원인 (Root Cause)

## 현상

전시 수정/작품 추가 단계에서 **참여 작가를 이미 선택한 뒤** “새 작품을 벌크로 올리려고 하면”, 벌크 업로드 화면에서 **다시 작가를 선택하는 단계**가 나타남.

## Root Cause

1. **진입 경로**
   - 전시 작품 추가 페이지(`/my/exhibitions/[id]/add`)에서는 **기존 작품 선택**은 같은 페이지의 그리드로 가능하지만, **새 작품 업로드**는 **단일 업로드**(`/upload?addToExhibition=...&from=exhibition&artistId=...`) 링크만 있었음.
   - **벌크 업로드**(`/upload/bulk`)로 가는 링크가 없었고, 있어도 쿼리 파라미터를 넘기지 않음.

2. **벌크 페이지 동작**
   - `/upload/bulk`는 **URL 쿼리 파라미터를 전혀 사용하지 않음** (`useSearchParams` 미사용).
   - 따라서 `addToExhibition`, `from`, `artistId` 등이 전달되지 않아, **전시·작가 컨텍스트가 없음**.
   - 벌크 플로우는 항상 **1) 의도 선택(intent) → 2) 작가/귀속(attribution) → 3) 이미지 업로드 → 4) 발행** 순서이므로, 전시에서 “이미 작가 선택됨” 상태를 넘길 수 없었음.

3. **결과**
   - 사용자가 전시 작품 추가에서 작가를 선택한 뒤 “벌크로 여러 작품 올리기”를 하려면, 업로드 탭 등에서 `/upload/bulk`로 직접 이동할 수밖에 없었고, 그 경우 **작가/전시 정보가 없어** 벌크 쪽에서 **다시 intent·작가 선택**을 하게 됨 → **작가를 중복으로 선택하는 루프**로 인식됨.

## 적용한 수정 요약

1. **전시 작품 추가 페이지**
   - **새 작품 업로드** 블록을 상단에 두고, **단일 업로드**·**벌크 업로드** 버튼을 눈에 띄게 배치.
   - 벌크 업로드 링크에 `addToExhibition`, `from=exhibition`, 참여 작가가 있으면 `artistId`(및 `artistName`, `artistUsername`)를 쿼리로 전달.

2. **벌크 업로드 페이지**
   - `useSearchParams()`로 `addToExhibition`, `from`, `artistId`, `artistName`, `artistUsername` 수신.
   - `from=exhibition`이고 `addToExhibition`·`artistId`가 있으면:
     - `intent = "CURATED"`, `selectedArtist`를 해당 작가로 설정, `attributionStepDone = true`로 두어 **의도/작가 선택 단계를 건너뛰고** 바로 **이미지 업로드·드래프트 단계**로 진입.
   - 발행 시 `intent === "CURATED"`이고 `addToExhibitionId`가 있으면:
     - `publishArtworksWithProvenance`에 `projectId: addToExhibitionId` 전달(클레임에 전시 연결).
     - 발행 성공 후 각 작품을 `addWorkToExhibition(addToExhibitionId, workId)`로 전시에 추가하고, `/my/exhibitions/{id}/add`로 리다이렉트.

3. **API**
   - `PublishWithProvenanceOptions`에 `projectId` 추가.
   - `publishArtworksWithProvenance`에서 CURATED/INVENTORY 클레임 생성 시 `projectId`를 넘겨 전시와 연결.

이로써 “전시에서 참여 작가까지 선택한 뒤 벌크 업로드” 시 **작가를 다시 고르지 않고** 바로 작품 업로드·발행 단계로 이어지며, 발행된 작품은 해당 전시에 자동으로 추가된다.
