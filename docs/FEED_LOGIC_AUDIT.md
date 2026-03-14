# 피드 출력 로직 점검 (인기 탭 순서가 적용되지 않는 원인)

## 요약

**인기 탭에서도 화면에는 “최신순”으로 보인다.**  
API는 `likes_count` 순으로 잘 내려주지만, **FeedContent에서 artworks와 exhibitions를 합친 뒤 `created_at` 기준으로 다시 정렬**하고 있어서, 인기 순서가 덮어쓰여진다.

---

## 1. 레이어별 동작

### 1) API (`listPublicArtworks`)

| sort     | DB 정렬 | 커서 |
|----------|---------|------|
| `latest` | `created_at desc`, `id desc` | (created_at, id) |
| `popular` | `likes_count desc`, `created_at desc`, `id desc` | (likes_count, created_at, id) |

- 응답 배열 순서 = 위 정렬 그대로.
- **충돌 없음.** 인기 탭이면 좋아요 많은 순으로 내려옴.

### 2) 전시 피드 API (`listPublicExhibitionsForFeed`)

- 항상 `created_at desc`, `id desc`.
- 인기/최신 탭 구분 없음.

### 3) FeedContent — 초기 로드 (`fetchArtworks`)

**진행 순서:**

1. `listPublicArtworks({ limit: 30, sort })`  
   → `list`: sort가 `popular`이면 **좋아요 순** 배열.
2. `listPublicExhibitionsForFeed(20)`  
   → `exhibitions`: **최신순** 배열.
3. **여기서 한 번에 합친 뒤, created_at 기준으로 재정렬:**

```ts
const entries: FeedEntry[] = [
  ...list.map((a) => ({ type: "artwork", created_at: a.created_at, artwork: a })),
  ...exhibitions.map((e) => ({ type: "exhibition", created_at: e.created_at, exhibition: e })),
].sort((a, b) => {
  const ta = new Date(a.created_at ?? 0).getTime();
  const tb = new Date(b.created_at ?? 0).getTime();
  return tb - ta;  // 항상 최신(created_at) 순
});
setFeedEntries(entries);
```

- **결과:** artworks가 API에서 받은 순서(최신순/인기순)와 관계없이, **전시와 섞인 뒤 “created_at 내림차순” 한 번 더 적용**됨.
- 따라서 **인기 탭이어도 화면에는 “가장 최근에 올라온 것”이 위로** 가고, 좋아요 0인 새 글이 좋아요 많은 글보다 위에 나올 수 있음.

### 4) FeedContent — 더 불러오기 (`loadMore`)

- 새로 받은 artworks + exhibitions를 `newEntries`로 만들고,
- `setFeedEntries((prev) => [...prev, ...newEntries].sort((a, b) => created_at 기준))` 로 **전체를 다시 created_at 기준 정렬**.
- **같은 이슈:** 인기 탭에서도 “최신순” 한 번 더 적용되어, API 인기 순서가 유지되지 않음.

### 5) `buildFeedItems`

- `feedEntries` 순서는 그대로 두고, **매 5개마다 discovery 블록 하나** 끼워 넣기만 함.
- 정렬을 바꾸는 로직 없음. **충돌 없음.**

---

## 2. 원인 정리

| 구간 | 역할 | 인기 탭과의 관계 |
|------|------|------------------|
| API | 인기 탭이면 `likes_count` 순으로 반환 | ✅ 의도대로 동작 |
| FeedContent 초기 로드 | artworks + exhibitions 합친 뒤 **created_at으로 정렬** | ❌ 여기서 인기 순서가 사라짐 |
| FeedContent loadMore | 새 데이터 붙인 뒤 **다시 created_at으로 정렬** | ❌ 동일 |
| buildFeedItems | discovery만 삽입, 정렬 없음 | ✅ 영향 없음 |

**결론:**  
인기 순서가 안 보이는 이유는 **API가 잘못된 것이 아니라**,  
**“작품 + 전시를 합친 뒤 무조건 created_at으로만 정렬”하는 FeedContent 쪽 로직** 때문이다.

---

## 3. 관찰된 현상과의 대응

- **좋아요 0인 게시물이 더 상단에 노출**  
  → 그쪽이 `created_at`이 더 최근이라, 합친 뒤 created_at 정렬 시 위로 감.
- **좋아요 3인 게시물이 좋아요 1인 게시물보다 아래**  
  → 좋아요 3인 쪽이 더 오래된 글이어서, created_at 정렬 시 아래로 밀림.

즉, **현재 화면 순서는 전부 “created_at 기준”만 반영된 상태**이고, 인기 탭일 때의 `likes_count` 순서는 이미 여기서 지워진다.

---

## 4. 나중에 수정할 때 방향 (참고)

- **최신 탭**  
  - 지금처럼 artworks + exhibitions 합친 뒤 `created_at` 정렬 유지해도 됨.
- **인기 탭**  
  - “인기 순서를 유지”하려면, 합친 뒤 **한 번에 created_at으로만 정렬하면 안 됨.**  
  - 예:  
    - artworks는 **API에서 받은 순서(좋아요 순) 유지**,  
    - 전시만 `created_at` 순으로 넣고,  
    - “작품 순서는 건드리지 않고, 전시를 적절한 위치에 끼워 넣기” 같은 식으로 합치거나,  
    - 또는 인기 탭일 때는 **전시를 빼고 작품만 좋아요 순으로 보여주기** 등 정책 결정 후 구현.

이 문서는 “지금 피드 로직이 어떻게 되어 있는지”와 “인기 탭이 의도대로 보이지 않는 이유”를 정리한 점검 결과다.
