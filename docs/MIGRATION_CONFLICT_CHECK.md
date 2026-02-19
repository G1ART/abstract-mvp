# 마이그레이션 적용 전 충돌 점검 (대규모 패치)

## 적용 대상
- `p0_price_inquiry_artist_id_triple_fallback.sql`
- `p0_price_inquiry_resend_notification.sql`
- (이미 적용된 마이그레이션은 Supabase가 자동으로 스킵)

## 기존 기능 레이어와의 정합성

| 영역 | 점검 내용 | 결과 |
|------|-----------|------|
| **price_inquiry_artist_id** | 동일 함수명으로 `create or replace`. get_price_inquiry_recipient_ids, can_reply_to_price_inquiry, can_select_price_inquiry, notify_on_price_inquiry 모두 이 함수만 참조. 시그니처·반환 타입 동일. | ✅ 기존 호출부 변경 없음, 수신자만 더 넓게 확보 |
| **claims / artworks** | triple_fallback은 claims·artworks 읽기만 함. RLS/트리거/제약 변경 없음. | ✅ 충돌 없음 |
| **notify_on_price_inquiry** | 트리거·함수 수정 없음. get_price_inquiry_recipient_ids 경로로만 수신자 사용. | ✅ 동일 동작, 수신자 보강 |
| **resend RPC** | 신규 함수. price_inquiries·notifications만 사용. inquirer 본인·미답변만 허용. | ✅ 기존 API/RLS와 독립 |
| **백필 INSERT** | notifications에만 insert. not exists로 동일 (user_id, type, inquiry_id) 중복 방지. 재실행 시 스킵. | ✅ 멱등 |
| **앱** | resendPriceInquiryNotification(inquiryId) 이미 반영됨. 스키마 변경 없음. | ✅ 호환 |

## 실행 순서
Supabase는 파일명 순으로 적용. `p0_price_inquiry_artist_id_triple_fallback` → `p0_price_inquiry_resend_notification` 순서 보장됨. 백필 시점에 이미 3단계 fallback 적용된 상태로 수신자 계산됨.

## 결론
기존 기능 레이어와 충돌 없음. 적용 진행.
