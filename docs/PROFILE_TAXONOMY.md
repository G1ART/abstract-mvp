# PROFILE_TAXONOMY (Single Source of Truth)

Last updated: 2026-02-15 (America/Los_Angeles)

목표
- 상세 프로필 입력의 진입장벽을 낮추기 위해 “자유입력 최소화 + 선택형 기본”으로 구성합니다.
- 추천/검색/AI taste/people relevancy의 기반이 되는 안정적인 분류 체계를 제공합니다.
- 모든 페르소나(Artist/Curator/Gallerist/Collector)가 공정하게 ‘프로필 완성도’ 점수를 얻도록 설계합니다.

원칙
1) 선택형(드롭다운/멀티셀렉트)을 기본으로 하고, “Other(직접입력)”는 1–2개 슬롯만 허용합니다.
2) Themes/Styles/Mediums는 고정 taxonomy + 기타 입력 병행.
3) Country/Region은 선택형, City는 자유입력(후에 자동완성).
4) 초기에는 “최대 선택 개수”로 피로도를 제어합니다.
5) 용어는 EN/KO 모두 제공하며, UI/DB는 EN slug를 canonical로 사용합니다.

---

## A) Core (All personas)

### 1) Career stage (single select)
- early_career — Early career / 신진
- emerging — Emerging / 신흥(성장기)
- mid_career — Mid-career / 중견
- established — Established / 기성(중진 이상)
- institution — Institution-led / 기관 중심(큐레이터/기관)
- private_practice — Private practice / 개인 활동
- prefer_not — Prefer not to say / 응답 안 함

### 2) Age band (single select)
- u18 — Under 18 / 18세 미만
- 18_24 — 18–24
- 25_34 — 25–34
- 35_44 — 35–44
- 45_54 — 45–54
- 55_64 — 55–64
- 65p — 65+
- prefer_not — Prefer not to say / 응답 안 함

### 3) Location
- Country: dropdown (canonical EN country name)
- Region: dropdown (coarse)
  - us_west, us_east, us_midwest, us_south
  - kr_seoul, kr_metro, kr_other
  - eu_west, eu_central, eu_east
  - jp, cn, sea, oceania, latam, mena, africa, other
- City: free text

### 4) Themes (multi select; recommend ≥3, max 5)
Canonical slug -> EN label / KO label
- identity_body — Identity & Body / 정체성과 몸
- memory_archive — Memory & Archive / 기억과 아카이브
- nature_ecology — Nature & Ecology / 자연과 생태
- tech_future — Technology & Future / 기술과 미래
- urban_city — Urban / City Life / 도시와 삶
- spirituality_myth — Spirituality & Myth / 영성·신화
- politics_society — Politics & Society / 정치·사회
- migration_diaspora — Migration & Diaspora / 이주·디아스포라
- labor_industry — Labor & Industry / 노동·산업
- time_impermanence — Time & Impermanence / 시간·무상
- love_intimacy — Love & Intimacy / 사랑·친밀
- violence_conflict — Violence & Conflict / 폭력·갈등
- humor_play — Humor & Play / 유머·유희
- dreams_surreal — Dreams & Surreal / 꿈·초현실
- minimal_silence — Minimal / Silence / 미니멀·침묵
- material_process — Materiality / Process / 물질성·과정
- portrait_figure — Portrait / Figure / 인물·형상
- landscape — Landscape / 풍경
- abstraction — Abstraction / 추상
- conceptual_text — Conceptual / Text / 개념·텍스트
- pattern_ornament — Pattern / Ornament / 패턴·장식
- light_space — Light & Space / 빛·공간
- sound_performance — Sound / Performance / 사운드·퍼포먼스
- architecture — Architecture / 건축
- science_cosmos — Science / Cosmos / 과학·우주
- ritual_tradition — Ritual / Tradition / 의례·전통
- consumer_media — Consumerism / Media / 소비·미디어
- healing_care — Healing / Care / 치유·돌봄
- other — Other (custom) / 기타(직접 입력)

### 5) Keywords (optional; free text tags; max 10)
- 자유 키워드. 추천/검색/AI taste에 보조 신호로 사용.

---

## B) Artist module (Artist role recommended)

### 1) Mediums (multi select; max 4)
- painting — Painting / 회화
- drawing — Drawing / 드로잉
- sculpture — Sculpture / 조각
- photography — Photography / 사진
- print_edition — Print/Edition / 판화·에디션
- textile_fiber — Textile/Fiber / 섬유
- ceramics — Ceramics / 도자
- wood_metal — Wood/Metal / 목·금속
- collage_mixed — Collage/Mixed / 콜라주·혼합
- installation — Installation / 설치
- video — Video / 비디오
- new_media — New Media / 뉴미디어
- performance — Performance / 퍼포먼스
- other — Other (custom) / 기타(직접 입력)

### 2) Styles (multi select; max 6)
- minimalism — Minimalism / 미니멀리즘
- maximalism — Maximalism / 맥시멀리즘
- geometric — Geometric / 기하학적
- gestural — Gestural / 제스처·행위적
- lyrical — Lyrical / 서정적
- monochrome — Monochrome / 단색조
- figurative — Figurative / 구상
- narrative — Narrative / 서사적
- surreal — Surreal / 초현실
- pop — Pop / 팝
- expressionism — Expressionism / 표현주의적
- conceptual — Conceptual / 개념미술
- text_based — Text-based / 텍스트 기반
- photoreal — Photoreal / 극사실
- documentary — Documentary / 다큐멘터리
- site_specific — Site-specific / 장소특정
- experimental — Experimental / 실험적
- craft_forward — Craft-forward / 공예 지향
- digital — Digital / 디지털
- other — Other (custom) / 기타(직접 입력)

### 3) Education (repeatable; optional)
- school (text), program (text), year (int, nullable), type (select)
- type: hs_art / ba / bfa / ma / mfa / phd / other

---

## C) Collector module (Collector role recommended)

### 1) Price band (single select; max 1)
- u500 — Under $500 / $500 미만
- 500_1k — $500–$1k
- 1k_2_5k — $1k–$2.5k
- 2_5k_5k — $2.5k–$5k
- 5k_10k — $5k–$10k
- 10k_25k — $10k–$25k
- 25k_50k — $25k–$50k
- 50k_100k — $50k–$100k
- 100k_p — $100k+ / $100k 이상
- not_sure — Not sure / 미정
- prefer_not — Prefer not to say / 응답 안 함

### 2) Acquisition channels (multi select; max 4)
- gallery — Gallery / 갤러리
- art_fair — Art fair / 아트페어
- auction — Auction / 옥션
- online — Online platforms / 온라인
- commission — Commission / 커미션
- advisor — Advisor/Concierge / 어드바이저·컨시어지
- other — Other (custom) / 기타(직접 입력)

### 3) Collecting focus (optional; multi select; max 5)
- themes + styles + mediums 조합으로 대부분 커버하되,
- 필요하면 “focus keywords”를 따로 받는다(예: blue chip, emerging, photo edition).

---

## D) Curator/Gallerist module (recommended)

### 1) Affiliation (single select)
- independent — Independent / 독립
- gallery — Gallery / 갤러리
- museum — Museum / 미술관
- nonprofit — Nonprofit / 비영리
- academic — Academic / 학계
- other — Other / 기타

### 2) Program focus (multi select; max 5)
- themes와 동일 taxonomy를 재사용
