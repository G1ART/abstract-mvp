# docs/ENTITLEMENTS.md
# Abstract — Entitlements & Visibility (SSoT)

Last updated: 2026-02-14 (America/Los_Angeles)  
Owner: Product (Single Source of Truth)

## 0) Why this doc exists
Abstract의 구독/공개정책은 “플랫폼 가치”의 핵심입니다. 이 문서는 아래 3가지를 **단일 기준**으로 고정합니다.
1) 페르소나별(Artist/Curator/Collector/…) 핵심 욕망(why pay)  
2) 게스트/로그인/유료 티어별 데이터·기능 노출 범위  
3) 개발 구현의 기준(RLS/RPC/UI gating)이 되는 권한 정의

---

## 1) Personas
- **Guest**: 비로그인 방문자
- **Logged-in Free**: 로그인(무료)
- **Artist (Creator)**: 작품 업로드/포트폴리오 운영 주체
- **Curator**: 작가/작품 발굴 및 전시·리서치 주체
- **Collector**: 구매/소장 및 관계 형성 주체
- **Gallerist**: 작가/작품을 시장·전시로 연결하는 중개자
- (Future) **Org/Institution**: 데이터/리포트 구매 주체

---

## 2) Plans (initial)
- **Free**
- **Artist Pro**
- **Discovery Pro** (Curator/Collector/Gallerist용 단일 프로 플랜; 후에 분화 가능)
- (Future) **Enterprise/Data**

> 결제 연동 전에도 plan은 “권한 상태”로 존재해야 함. (entitlements 테이블)

---

## 3) Visibility levels (canonical terms)
- **Public**: 게스트도 접근 가능
- **Login**: 로그인 필요
- **Pro**: 유료 플랜 필요
- **Owner-only**: 본인만
- **Approval-gated**: 상대(소유자) 승인 필요
- **Role-gated**: 특정 role만 접근 가능(예: Curator/Collector만)

---

## 4) Product principles (non-negotiables)
1) **Data accumulates, exposure is gated**  
   이벤트(views/likes/follows)는 최대한 수집하되, 노출은 entitlements로 제어한다.
2) **Free must be useful**  
   네트워크 효과를 위해 Free에서도 “발견/연결”이 가능해야 한다.
3) **Pro sells curiosity + leverage**  
   Artist Pro = “누가/어떤 페르소나가 관심을 보였는가”  
   Discovery Pro = “추가 정보/프라이빗 접근/고급 탐색”
4) **No dead-end paywalls**  
   잠금(locked)은 반드시 “대체 경로(문의/요청/티저)”가 있어야 한다.
5) **Fairness controls**  
   지나친 노출(스팸/남용)을 막기 위해 credits/limit/approval를 활용한다.

---

## 5) Feature & Data Matrix (v1.0)

### 5.1 Profiles & Portfolio
| Item | Guest | Login Free | Artist Pro | Discovery Pro | Notes |
|---|---:|---:|---:|---:|---|
| Public profile (display_name/@username/bio/roles) | Public | Public | Public | Public | 기본 발견 |
| Portfolio (public artworks) | Public (limited) | Login | Login | Login | Guest는 “샘플”만(예: 6개) 권장 |
| Website/location 등 확장 필드 | Public (optional) | Public | Public | Public | 사용자가 공개 선택 |
| Private profile | Hidden | Hidden | Owner-only | Hidden | Owner self-view 예외 |
| Portfolio reorder | Hidden | Owner-only | Owner-only | Owner-only | Owner console 기능 |

### 5.2 Artworks: info access & unlock
| Item | Guest | Login Free | Artist Pro | Discovery Pro | Notes |
|---|---:|---:|---:|---:|---|
| Artwork image + basic meta | Public (limited) | Login | Login | Login | Guest는 제한 권장 |
| Price display (artist-controlled) | Hidden by default | Inquire only | Inquire only | Unlock (if allowed) | “공개가격/문의” 선택 가능 |
| Extra fields (edition/provenance/condition) | Hidden | Hidden | Owner-only | Unlock (artist-controlled) | unlock은 Role+Plan+Approval 조합 가능 |
| Draft/private artworks | Hidden | Owner-only | Owner-only | Approval-gated | “private share”는 approval 기반 |

### 5.3 Discovery & Search
| Item | Guest | Login Free | Artist Pro | Discovery Pro | Notes |
|---|---:|---:|---:|---:|---|
| People (recommended) | Login prompt | Login | Login | Login | 전체 나열 금지 |
| People advanced filters | Hidden | Basic | Basic | Pro | 고급 facet은 Pro |
| Saved searches/alerts | Hidden | Hidden | Optional | Pro | P1/P2 |

### 5.4 Insights (Curiosity monetization)
| Item | Guest | Login Free | Artist Pro | Discovery Pro | Notes |
|---|---:|---:|---:|---:|---|
| Profile views count (last 7/30d) | Hidden | Owner-only (count) | Owner-only (count) | Hidden | Free는 “총량”까지만 |
| Profile viewers list (“who viewed”) | Hidden | Locked (teaser) | Owner-only (list) | Hidden | 핵심 후크 |
| Artwork engagement list (who liked/viewed) | Hidden | Likes are public; views list locked | Owner-only (list) | Hidden | views list는 Pro |
| Network composition (by persona) | Hidden | Teaser | Owner-only | Hidden | “curator 관심 ↑” 같은 인사이트 |

### 5.5 Messaging / Requests (future)
| Item | Guest | Login Free | Artist Pro | Discovery Pro | Notes |
|---|---:|---:|---:|---:|---|
| Inquiry | Hidden | Limited | Limited | Expanded | credits 도입 가능 |
| Unlock request (price/private) | Hidden | Basic | Basic | Pro | approval 기반 |

---

## 6) Entitlements → Features mapping (implementation contract)
### Plans
- Free
- Artist Pro
- Discovery Pro

### Feature flags (logical)
- `VIEW_PROFILE_VIEWS_COUNT` (Owner-only, Free+)
- `VIEW_PROFILE_VIEWERS_LIST` (Owner-only, Artist Pro+)
- `VIEW_ARTWORK_VIEWERS_LIST` (Owner-only, Artist Pro+)
- `UNLOCK_PRICE_FIELDS` (Discovery Pro, artist-controlled)
- `UNLOCK_PRIVATE_WORKS` (Discovery Pro + approval)

> 구현에서는 “plan → features” 매핑을 단일 함수로 유지한다. (e.g., `hasFeature(plan, feature)`)

---

## 7) Storage / Data collection notes (v1.0)
- profile_views / artwork_views는 TTL de-dup(예: 30분)로 중복 방지
- raw viewer rows는 Owner-only RLS
- 무료는 **집계 RPC**, 유료는 **리스트 RPC**로 노출 분리

---

## 8) Roadmap alignment
- vNext: People recommended paging + entitlements skeleton + profile views count/list gating
- P1: search_people RPC + advanced filters + saved searches
- P2: scoring/recommendation graph + exposure boosts + enterprise reporting
