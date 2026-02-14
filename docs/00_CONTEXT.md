# Abstract MVP — Context (SSOT)

## What Abstract is
Abstract는 “작가 중심의 작품 아카이브 + 관계(팔로우) + 피드(탐색) + 최소한의 시장 신호(가격/소장/좋아요)”를 제공하는 웹 기반 아트 플랫폼 MVP입니다.
목표는 빠르게 작품을 올리고, 작가/큐레이터/콜렉터가 서로를 발견하고, 작가의 세계관(작품 간 연결)을 축적하는 것입니다.

## Target users (MVP scope)
- 업계 종사자는 모두 진입 가능: Artist / Collector / Curator / Gallerist 등
- “페르소나 분기 온보딩”은 하지 않음
- 앱 내에서 main_role 1개 + roles 다중 선택(최소 1개) 가능

## Core principles / non-negotiables
1) 세션 유지: 창을 닫지 않는 한 로그인 유지
2) 헤더 좌측 “Abstract” 로고 클릭 = 로그인 초기화가 아니라 항상 최신 Feed로 이동
3) Follow UX
   - 클릭 후 상태는 Following
   - Desktop: hover로 Unfollow(색상 변화) → 클릭 시 confirm
   - Mobile: hover 없음 → Following 탭 시 바로 confirm
4) 작품 메타 중 공개 필수: ownership_status(소장/가용 여부)
   - 이미 소장된 작품도 아카이빙/세계관 연결 위해 업로드 가능
5) 가격 정책
   - pricing_mode: fixed | inquire
   - is_price_public: 공개/비공개
   - inquire면 “Price upon request”
   - 통화 표시는 USD 기준(입력 통화가 KRW여도 USD 변환 저장/표시)

## MVP definition
MVP는 “작품 업로드 → 공개 → 피드 노출 → 프로필/팔로우 → 좋아요/정렬 → 기본 KPI”가 끊기지 않는 상태.
거래(결제/오퍼/메시징)는 MVP 범위 밖.

## Tech stack
- Next.js (App Router)
- Supabase (Auth, Postgres, Storage, RLS, RPC)
- Vercel deploy
