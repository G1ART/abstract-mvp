# 가격 문의 알림 누락 — Fall-off 점검 및 수정

## 1. 알림이 가지 않는 경우 (전부)

| # | 원인 | 조건 | 수정 |
|---|------|------|------|
| 1 | **수신자 0명** | `price_inquiry_artist_id(artwork_id)` = NULL → get_price_inquiry_recipient_ids가 아티스트를 넣지 않음 | price_inquiry_artist_id에 2단계 fallback 적용 (이미 적용: CREATED → artworks.artist_id). **추가**: 3단계 fallback = claims의 artist_profile_id 또는 subject_profile_id (CREATED 없고 artist_id도 null인 레거시/동기 실패 대비). |
| 2 | **문의자 = 아티스트** | `uid <> p_inquirer_id`로 제외. 자기 작품에 자기 계정으로 문의하면 알림 없음 | 의도된 동작. 변경 없음. |
| 3 | **과거 문의** | 문의 INSERT 시점에 트리거가 0명에게만 알림을 보냈으면, 그 시점에 알림 row가 없음. **이후** 패치해도 이미 발생한 문의에는 알림을 다시 보내지 않음 | 설계상 “문의 시점의 수신자”만 알림. 과거 문의에 대한 재발송은 별도 정책 없음. 신규 문의부터 3단계 fallback으로 누락 방지. |
| 4 | **트리거 버전** | `notify_on_price_inquiry()`가 **구버전**이면: `if v_artist_id is null then return new` 로 **아티스트 0명일 때 아무에게도 알림 안 보냄** | 마이그레이션 순서에 따라 delegates 버전(수신자 루프)이 적용돼 있어야 함. price_inquiry_artist_id를 3단계 fallback으로 강화하면, 같은 트리거라도 수신자가 1명 이상 나올 가능성이 높아짐. |

## 2. price_inquiry_artist_id가 NULL이 되는 경우

- **CREATED 클레임 없음** (갤러리/큐레이터 업로드 시 CREATED가 아닌 CURATED/EXHIBITED만 있음).
- **artworks.artist_id도 null** (레거시, 또는 claims_sync_artwork_artist 트리거 미적용/실패, 또는 예전 코드 경로).
- → **추가 fallback**: 해당 작품의 **claims 중 artist_profile_id 또는 subject_profile_id** (우선 CREATED, 없으면 다른 claim) 한 건에서 작가 프로필을 쓰면, “작품의 작가”를 한 번 더 복구할 수 있음.

## 3. 수정 내용 (마이그레이션)

- **p0_price_inquiry_artist_id_triple_fallback.sql**:  
  `price_inquiry_artist_id(p_artwork_id)` 를  
  `coalesce( CREATED의 subject, artworks.artist_id, (claims에서 work_id 일치·artist_profile_id 또는 subject not null인 것 중 CREATED 우선 1건의 coalesce(artist_profile_id, subject_profile_id)) )`  
  로 정의.  
  CREATED 없고 artist_id도 null인 작품도, CURATED/EXHIBITED 등 claim의 artist_profile_id로 알림 수신자 확보.

## 4. 기존 동작 보존

- CREATED 있음 → 기존과 동일 (CREATED subject 사용).
- CREATED 없고 artist_id 있음 → 기존과 동일 (artist_id 사용).
- CREATED 없고 artist_id null → **추가**로 claims의 artist_profile_id 또는 subject_profile_id 사용.  
  can_reply_to_price_inquiry, can_select_price_inquiry, get_price_inquiry_recipient_ids는 모두 price_inquiry_artist_id만 사용하므로, 한 함수만 바꿔도 일관되게 반영됨.

**과거 문의**: 알림은 문의 INSERT 시점에만 생성된다. 패치 이전·당시 수신자가 0명이었던 문의에는 **사후 알림을 보내지 않는다**. 신규/이후 문의부터 3단계 fallback으로 수신자 확보.
