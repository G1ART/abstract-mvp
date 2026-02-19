# 가격 문의 알림을 아티스트가 못 받는 경우 — 원인 및 수정

## 결론 (요약)

- **원인**: 해당 작품에 **CREATED 클레임이 없으면** `price_inquiry_artist_id(artwork_id)`가 **NULL**을 반환하고, 수신자 목록에 아티스트가 들어가지 않아 **알림이 생성되지 않음**.
- **수정**: `price_inquiry_artist_id`에서 CREATED가 없을 때 **`artworks.artist_id`로 fallback**하도록 변경하면, CREATED가 없는 작품도 아티스트가 알림·답변·문의 목록을 받을 수 있음.

---

## 1. 알림이 생성·전달되는 경로

1. 콜렉터가 가격 문의 INSERT → 트리거 `notify_on_price_inquiry()` 실행.
2. 트리거는 **`get_price_inquiry_recipient_ids(artwork_id, inquirer_id)`**로 수신자 UUID 목록을 구함.
3. 각 수신자마다 `notifications`에 INSERT (`type = 'price_inquiry'`).
4. 클라이언트는 `notifications`를 `user_id = auth.uid()`로 SELECT (RLS).

즉, **수신자 목록에 들어가지 않으면 알림 row 자체가 INSERT되지 않음.**

---

## 2. 수신자 목록이 어떻게 정해지는지

`get_price_inquiry_recipient_ids` (p0_claims_period_and_price_inquiry_delegates.sql):

```sql
select distinct uid from (
  select public.price_inquiry_artist_id(p_artwork_id) as uid
  union
  select * from public.get_current_delegate_ids(p_artwork_id)
) t
where uid is not null and uid <> p_inquirer_id;
```

- **아티스트**: `price_inquiry_artist_id(artwork_id)` 1명.
- **델리게이트**: `get_current_delegate_ids(artwork_id)` (INVENTORY/CURATED/EXHIBITED, confirmed, current).
- `uid is not null`이므로 **`price_inquiry_artist_id`가 NULL이면 아티스트는 수신자에서 제외됨.**

---

## 3. price_inquiry_artist_id 정의

현재 정의 (p0_price_inquiries.sql / p0_repair_42703.sql):

```sql
select c.subject_profile_id
from public.claims c
where c.work_id = p_artwork_id and c.claim_type = 'CREATED'
limit 1;
```

- **CREATED 클레임만** 사용. `artworks.artist_id`는 사용하지 않음.
- 따라서 **해당 작품에 CREATED 클레임이 없으면 항상 NULL.**

---

## 4. “CREATED가 없는” 경우가 생기는 이유

- **백필 조건**: `p0_claims_backfill_created.sql`는  
  `visibility = 'public'` 이고 `artist_id is not null` 이고 **CREATED가 이미 없는** 작품만 대상.
- 따라서 다음이면 CREATED가 없을 수 있음:
  - 백필이 한 번도 안 돌아간 환경.
  - **비공개/초안** 작품 (`visibility != 'public'`은 백필 대상 아님).
  - 백필 **이전**에 이미 올라온 작품 중, 나중에 artist_id만 채워진 경우 등.
  - 앱에서 작품 생성 시 CREATED 클레임을 만들지 않는 경로가 있는 경우.

이런 작품들은 모두 **`price_inquiry_artist_id` = NULL → 수신자 0명(또는 delegate만) → 아티스트는 가격 문의 알림을 못 받음.**

---

## 5. 기타 가능 원인 (이미 만족 시 알림은 감)

- **문의자 = 아티스트**: `uid <> p_inquirer_id`로 제외되므로, 자기 자신에게 보내는 문의는 알림 없음. (의도된 동작.)
- **notifications RLS**: SELECT는 `user_id = auth.uid()`만 허용. INSERT는 트리거(SECURITY DEFINER)가 하므로 RLS에 막히지 않음. 즉 “알림 row가 INSERT되지 않는 것”이 문제이지, “INSERT는 됐는데 안 보인다”가 아님.

---

## 6. 수정안: price_inquiry_artist_id에 artworks.artist_id fallback

**의도**: CREATED가 없어도, `artworks.artist_id`가 있으면 그 사용자를 “가격 문의 아티스트”로 간주해 알림·답변·문의 조회가 되게 함.

```sql
create or replace function public.price_inquiry_artist_id(p_artwork_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select c.subject_profile_id from public.claims c where c.work_id = p_artwork_id and c.claim_type = 'CREATED' limit 1),
    (select a.artist_id from public.artworks a where a.id = p_artwork_id limit 1)
  );
$$;
```

- CREATED가 있으면: **기존과 동일** (CREATED의 subject_profile_id).
- CREATED가 없고 artist_id만 있으면: **artist_id** 반환 → 수신자에 포함 → 알림 수신 가능.

---

## 7. 다른 기능에 미치는 영향

| 기능 | 사용처 | 영향 |
|------|--------|------|
| **can_reply_to_price_inquiry** | RLS, 앱 | price_inquiry_artist_id만 사용. fallback 시 artist_id 사용자도 답변 가능 → 의도와 일치. |
| **can_select_price_inquiry** | RLS | 동일. artist_id 사용자가 문의 목록/row 조회 가능 → 의도와 일치. |
| **get_price_inquiry_recipient_ids** | 트리거 | 아티스트가 수신자에 포함됨 → 알림 수신 가능. |
| **notify_on_price_inquiry_reply** | 트리거 | coalesce(replier, price_inquiry_artist_id) 등 기존 로직 유지. fallback 시에도 동일. |
| **claims RLS** | claims 테이블 | `artwork_artist_id(work_id)` 사용. price_inquiry_artist_id와 무관 → 영향 없음. |
| **피드/프로필** | artworks.artist_id 기준 | 동일 인물이면 일관됨. |

- **CREATED와 artist_id 불일치**: CREATED의 subject = A, artist_id = B인 경우, coalesce로 **A가 우선**이므로 기존과 동일하게 “CREATED 주체”가 알림/답변 권한을 가짐.

---

## 8. 적용 방법

- 새 마이그레이션에서 **위 `price_inquiry_artist_id` 정의만** 교체하면 됨.
- 기존 트리거/RLS/함수는 그대로 두고, 이 함수 한 개만 바꾸면 되므로 기존에 잘 되던 기능은 유지됨.
