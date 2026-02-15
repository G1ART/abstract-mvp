# docs/MONETIZATION_SURFACES.md
# Abstract — Monetization Surfaces (Upgrade Exposure Strategy)

Last updated: 2026-02-14 (America/Los_Angeles)  
Owner: Product

## 0) Goal
유료 업그레이드는 “자주 보여서”가 아니라 **필요한 순간에, 근거(티저 데이터)와 함께** 등장해야 전환이 납니다.  
이 문서는 Abstract에서 업그레이드를 노출할 **표준 위치/트리거/빈도 제한**을 정의합니다.

---

## 1) Principles
1) **Trigger-based only**: 사용자의 의도가 확인되는 순간에만 노출한다.
2) **Evidence first**: 티저(예: “조회 34회”)를 먼저 보여주고, “누가 봤는지”를 유료로 제안한다.
3) **Low frequency**: 동일 유저에게 동일 CTA는 과노출 금지.
4) **No dead-end**: 잠금은 대체 행동(문의/요청/저장/팔로우)을 항상 제공한다.
5) **Respect trust**: 락 아이콘/모달 남발 금지. 핵심 3곳에만 집중.

---

## 2) Core Surfaces (v1.0)
### Surface A — /me Insights card (Artist Pro hook)
- 위치: `/me` 상단 KPI 아래
- 트리거: Owner가 로그인 상태일 때 항상 노출(단, 업셀 CTA는 조건부)
- 무료 노출:
  - “Profile views (last 7 days): 34” (count)
  - CTA: “Upgrade to see who viewed you”
- 유료 노출:
  - count + 최근 viewers 리스트(예: 10명) + “See all”
- 빈도:
  - CTA dismissed 시 7일간 숨김
  - list는 Artist Pro 이상에서만

### Surface B — Locked viewers (inline lock with teaser)
- 위치: `/me` 또는 `/u/<me>` 인사이트 섹션
- 트리거: “누가 봤는지” UI가 필요한 위치에서만
- 무료 노출:
  - “Top viewer personas this week: Curator 2, Collector 1” 같은 ‘익명 집계’ 티저 가능
  - “See details” 클릭 시 업그레이드 안내
- 빈도:
  - 모달은 세션당 1회
  - 7일 내 재노출 제한

### Surface C — Price / Private unlock (Discovery Pro hook)
- 위치: 작품 상세(/artwork/[id])의 가격/추가정보/프라이빗 영역
- 트리거: 사용자가 “가격 보기/추가 정보 보기/프라이빗 요청”을 클릭했을 때만
- 무료 노출:
  - Inquire 버튼(기본 경로)
  - Unlock CTA: “Unlock price details with Discovery Pro” (단, artist가 허용한 경우에만)
- 유료 노출:
  - 가격/추가 필드 표시 + “Request private access” (approval-gated)
- 빈도:
  - 동일 작품에서 하루 1회 업셀 노출(로컬/서버 플래그)

---

## 3) Frequency caps (global)
- Upgrade modal: **세션당 1회**
- 동일 surface CTA: **7일 1회**
- “Dismiss”는 즉시 반영 + 재노출 기간 저장
- 구현 우선순위:
  1) localStorage/sessionStorage (MVP)
  2) server-side preference (성장 단계)

---

## 4) Copy guidelines (tone)
- 금지: 과장/공포(“지금 당장 놓치고 있습니다”)
- 권장: 근거 기반(“지난 7일 조회 34회 — 누가 봤는지 확인하기”)
- 짧게: 1문장 + 1CTA
- CTA 문구 표준:
  - “See who viewed you”
  - “Unlock price details”
  - “Upgrade to Pro”

---

## 5) Metrics (v1.0)
- Impression → CTA click (CTR)
- Upgrade intent (upgrade page/open)
- Retention proxy (베타: “관심 등록/대기 리스트”로 대체 가능)

---

## 6) Change log
- v1.0: /me 인사이트 카드 + 작품 가격 unlock + 빈도 캡 표준화
