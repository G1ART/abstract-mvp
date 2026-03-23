# Abstract — KPI Dashboard (Investor One-Pager)
Last updated: 2026-02-14 (America/Los_Angeles)

> 목적: “임계값(유저수)” 대신 “지표(습관/리텐션/추천 품질/유료전환)”로 PMF와 투자 설득력을 관리합니다.  
> 범위: 현재 제품 구조(Feed/People 추천 + Entitlements/Viewers + Draft/Bulk + Portfolio Reorder)를 기준으로 측정 가능하게 설계합니다.

---

## 0) North Star
### North Star Metric: Qualified Connections / Week
- 정의: 주간 기준 “가치 있는 연결” 수.
  - 예시(권장 룰): 하나의 세션에서 아래 중 **2개 이상** 발생
    - Follow, Like, Save(추후), Profile View(>=X초), Inquire(추후), Share(추후)
- 왜 중요한가: 양면 시장에서 **연결 밀도**가 플랫폼 가치의 핵심이며, AI 추천은 이 숫자를 가속해야 합니다.
- 초기 목표(Seed~Seed+): 주간 +10~20% 성장(초기엔 방향성이 더 중요)

---

## 1) Acquisition & Activation
| KPI | 정의 | 초기 목표(베타→Seed) | 측정 방법 |
|---|---|---:|---|
| Signups / week | 주간 가입자 | 지속 증가 | auth events |
| Onboarding completion rate | 가입 대비 onboarding 완료 비율 | 70%+ | onboarding 완료 이벤트 |
| Profile completeness avg | profiles.profile_completeness 평균 | 평균 60+ | profiles 테이블 |
| “First value” time | 가입→첫 의미 행동(Like/Follow/View)까지 시간 | 지속 단축 | 이벤트 타임스탬프 |

---

## 2) Supply / Demand (Two-sided)
| KPI | 정의 | 초기 목표(베타→Seed) | 측정 방법 |
|---|---|---:|---|
| Active Artists MAU | 월 1회 이상 행동한 Artist role 유저 | 500→1,500→3,000 | profiles roles + events |
| Active Discovery MAU | 월 1회 이상 행동한 Curator/Collector/Gallerist | 50→150→400 | roles + events |
| Public artworks | visibility=public 작품 수 | 5,000→20,000+ | artworks count |
| Supply freshness | 최근 7일 신규 public 작품 수 | 상승 | created_at count |

---

## 3) Engagement
| KPI | 정의 | 초기 목표(베타→Seed) | 측정 방법 |
|---|---|---:|---|
| WAU/MAU | 주간 활성 / 월간 활성 | 35~50%+ | events |
| Sessions / WAU | 주간 사용자당 세션 수 | 증가 | sessionization |
| Depth / session | 세션당 작품뷰/프로필뷰/좋아요/팔로우 | 증가 | views/likes/follows |
| People Load More rate | People 추천에서 load more 사용 비율 | 20%+ | people_load_more 이벤트 |

---

## 4) Retention
| KPI | 정의 | 초기 목표(베타→Seed) | 측정 방법 |
|---|---|---:|---|
| D7 retention | 가입 후 7일 내 재방문 | 20~30% | cohort retention |
| D30 retention | 가입 후 30일 내 재방문 | 10~15% | cohort retention |
| Weekly retained | 주간 재방문 사용자 수 | 상승 | weekly cohorts |

---

## 5) Recommendation Quality (AI-ready)
> “AI 추천 v0” 도입 전에도 레인/추천 품질 KPI를 먼저 정의해두고, 임베딩이 붙을수록 개선되도록 설계합니다.

| KPI | 정의 | 초기 목표(베타→Seed) | 측정 방법 |
|---|---|---:|---|
| Lane CTR (For You) | For You 레인 카드 클릭률 | 8~15%+ | lane_impression + lane_click |
| Lane CTR (Expand) | Expand 레인 클릭률 | 6~12%+ | lane events |
| Serendipity rate | Expand에서 “새 작가/새 태그” 상호작용 비율 | 25~40% | novelty 계산 |
| Save/Like rate from recs | 추천을 통해 Like/Save로 이어짐 | 증가 | click→like/save funnel |
| Explainability usage | “Why recommended” 노출/반응 | 상승 | reason_impression/click |

---

## 6) Monetization (Intent → Conversion)
> 결제 연동 전에는 **intent KPI**로 먼저 관리하고, 결제 연동 후 MRR/ARPU로 확장합니다.

| KPI | 정의 | 초기 목표(베타→Seed) | 측정 방법 |
|---|---|---:|---|
| Upgrade CTA CTR | /me 인사이트 카드 업그레이드 클릭률 | 3~8%+ | upgrade_cta_click |
| Viewer unlock intent | viewers locked 영역 클릭/시도 | 상승 | viewers_locked_click |
| Price/private unlock intent | price/private unlock 요청 | 상승 | unlock_request 이벤트(추후) |
| Pro MRR (early) | 유료 구독 MRR | $2k→$10k→$50k | Stripe 이후 |
| Conversion rate | Active→Paid 전환율 | 1~5% (초기) | billing + events |

---

## 7) Marketplace / Commerce (Future)
| KPI | 정의 | 목표 | 측정 방법 |
|---|---|---:|---|
| Inquire rate | 작품뷰 대비 inquiry 발생률 | 상승 | inquiry events |
| Response SLA | 문의 응답 시간 | 단축 | inquiry timestamps |
| GMV | 거래 총액 | 성장 | commerce records |

---

## 8) Trust & Safety / Quality
| KPI | 정의 | 목표 | 측정 방법 |
|---|---|---:|---|
| Report/abuse rate | 신고/차단/스팸 지표 | 낮게 유지 | moderation events |
| Profile verification rate | 검증 완료 비율(추후) | 상승 | verification status |
| Content removals | 정책 위반 콘텐츠 제거 | 통제 | admin logs |

---

## 9) Thresholds (투자 설득용 “임계값”을 KPI로 번역)
- Seed에서 중요한 건 “총 유저수”가 아니라 아래 4개가 동시에 보이는 것:
  1) Discovery MAU가 의미 있는 수준(예: 200~400+)으로 성장
  2) 코호트 리텐션이 개선(D30 10% 내외)
  3) 추천 레인 CTR/Serendipity가 재현 가능하게 유지/상승
  4) 유료 intent(CTA/locked click)가 누적되고, 소액 MRR이라도 발생

---

## 10) Instrumentation Plan (MVP-friendly)
- 최소 이벤트(권장):
  - feed_lane_impression, feed_lane_click
  - people_reco_impression, people_load_more, people_follow
  - profile_view(recorded), viewers_locked_click, upgrade_cta_click
  - artwork_view, artwork_like, follow
- 구현 순서:
  1) DB 이벤트 테이블(또는 간단 로그) → 주간 집계 RPC
  2) 이후 Mixpanel/Amplitude 등 외부 도구 연동
