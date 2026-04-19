# QA Matrix — Abstract Mega Upgrade

Sign‑off requires every row below to land on ✅ or ⬜ with justification.
Fill in **evidence** for every pass. Leave ❌ for anything blocked and
link a follow‑up issue.

## Legend

- ✅ Pass (manual or automated)
- ❌ Fail (must link an issue)
- ⬜ Not yet exercised
- `manual` — executed by QA in staging
- `e2e` — covered by a Playwright spec
- `sql` — covered by a SQL smoke test

## A. Trust hardening

| # | Case | Type | Expected | Result | Evidence |
|---|------|------|----------|--------|----------|
| A1 | anon read `artworks/<other>/*.jpg` | sql | allowed (public read) | ⬜ | `supabase/tests/p0_rls_matrix.sql` |
| A2 | anon delete `artworks/<owner>/x.jpg` | sql | rejected | ⬜ | `supabase/tests/p0_rls_matrix.sql` |
| A3 | owner delete own file | sql | allowed | ⬜ | `supabase/tests/p0_rls_matrix.sql` |
| A4 | non‑owner delete foreign file | sql | rejected | ⬜ | `supabase/tests/p0_rls_matrix.sql` |
| A5 | anon read private profile | sql | 0 rows | ⬜ | `supabase/tests/p0_rls_matrix.sql` |
| A6 | anon read public profile | sql | 1 row | ⬜ | `supabase/tests/p0_rls_matrix.sql` |
| A7 | `get_my_auth_state()` anonymous | sql | empty | ⬜ | `supabase/tests/p0_rls_matrix.sql` |
| A8 | `get_my_auth_state()` authed w/ password | sql | `has_password=true` | ⬜ | `supabase/tests/p0_rls_matrix.sql` |
| A9 | `/my` anon hits gate | e2e | redirect off `/my` | ⬜ | `e2e/auth-gate.spec.ts` |
| A10 | `/set-password` anon | e2e | redirect to `/login` | ⬜ | `e2e/auth-gate.spec.ts` |
| A11 | `/onboarding` anon | e2e | stays/redirect per spec | ⬜ | `e2e/auth-gate.spec.ts` |
| A12 | `/debug-schema` in prod | manual | 404 | ⬜ | `middleware.ts` |

## B. Identity spine

| # | Case | Type | Expected | Result | Evidence |
|---|------|------|----------|--------|----------|
| B1 | FeedArtworkCard with display_name | manual | name shown, `@handle` secondary | ⬜ | `src/components/FeedArtworkCard.tsx` |
| B2 | FeedArtworkCard w/o display_name | manual | `@handle` as primary | ⬜ | `formatIdentityPair` |
| B3 | FeedArtworkCard w/o display_name and w/o @ | manual | `UNKNOWN` fallback only | ⬜ | `formatDisplayName` |
| B4 | Notifications actor rendering | manual | identity formatter used | ⬜ | `src/app/notifications/page.tsx` |
| B5 | People card role chips | manual | primary first, max 3, i18n | ⬜ | `formatRoleChips` |
| B6 | Role label when key unknown | manual | raw key or `UNKNOWN` | ⬜ | `roleLabel` |

## C. Studio shell

| # | Case | Type | Expected | Result | Evidence |
|---|------|------|----------|--------|----------|
| C1 | StudioHero renders with no acting‑as | manual | completeness bar + CTAs | ⬜ | `src/components/studio/StudioHero.tsx` |
| C2 | StudioSignals locked state | manual | upsell copy, no fake number | ⬜ | `StudioSignals` |
| C3 | StudioNextActions w/ 0 artworks | manual | "Upload your first artwork" first | ⬜ | `computeStudioNextActions` |
| C4 | StudioNextActions w/ pending claim | manual | "Review pending claims" first | ⬜ | `computeStudioNextActions` |
| C5 | StudioSectionNav counts/badges | manual | unread badge when > 0 | ⬜ | `StudioSectionNav` |

## D. Onboarding

| # | Case | Type | Expected | Result | Evidence |
|---|------|------|----------|--------|----------|
| D1 | Invalid handle | manual | "3–20 chars…" inline | ⬜ | `onboarding.errorUsernameInvalid` |
| D2 | Taken handle | manual | "Already taken" inline | ⬜ | `onboarding.usernameTaken` |
| D3 | Available handle | manual | "Available" inline | ⬜ | `onboarding.usernameAvailable` |
| D4 | Preview card live update | manual | primary/secondary + chips update as user types | ⬜ | `formatIdentityPair` |
| D5 | Privacy toggle | manual | chip flips Public ↔ Private | ⬜ | `studio.hero.public/private` |

## E. Feed + People

| # | Case | Type | Expected | Result | Evidence |
|---|------|------|----------|--------|----------|
| E1 | Exhibition card | manual | curator/host above title | ⬜ | `FeedExhibitionCard` |
| E2 | People recommendation reason | manual | sentence not tag | ⬜ | `reasonTagToI18n` |
| E3 | People search uses unified API | manual | `getPeopleRecommendations(lane="search")` | ⬜ | `recommendations.ts` |

## F. Artwork / Exhibition / Inbox / Claims / Delegations

| # | Case | Type | Expected | Result | Evidence |
|---|------|------|----------|--------|----------|
| F1 | Artwork page hierarchy | manual | title → artist (chip+Follow) → year/medium → provenance → exhibitions → price/CTA → related | ⬜ | `src/app/artwork/[id]/page.tsx` |
| F2 | Provenance label | manual | i18n sentence, no raw claim_type | ⬜ | `provenanceLabel` |
| F3 | Acting‑as banner global | manual | visible on every page, Exit clears state | ⬜ | `ActingAsBanner` |
| F4 | `/my/inquiries` unread + stage | manual | amber ring + stage dropdown | ⬜ | existing page |
| F5 | `/my/claims` trust copy | manual | intro + trust note + pending chip | ⬜ | `src/app/my/claims/page.tsx` |
| F6 | `/my/delegations` stage chips | manual | Invitation / Acting as / Closed | ⬜ | `src/app/my/delegations/page.tsx` |

## G. Build + ship

| # | Case | Type | Expected | Result | Evidence |
|---|------|------|----------|--------|----------|
| G1 | `npx tsc --noEmit` | manual | 0 errors | ⬜ | local |
| G2 | `npm run build` | manual | 0 errors | ⬜ | local |
| G3 | `npx playwright test` | manual | smoke + auth‑gate pass | ⬜ | CI |
| G4 | `supabase db push` | manual | all migrations applied (incl. `20260419120000_ai_events.sql`) | ⬜ | staging |
| G5 | PR description links this file | manual | checked | ⬜ | PR body |

## H. AI-Native Studio Layer (Wave 1)

Prereq: staging has `OPENAI_API_KEY` set. Cases H8+ exercise the key-missing path.

| # | Case | Type | Expected | Result | Evidence |
|---|------|------|----------|--------|----------|
| H1 | `/my` intelligence area renders 4 cards | manual | Profile / Portfolio / Weekly Digest / Matchmaker appear under StudioPortfolioPanel | ⬜ | `src/components/studio/StudioIntelligenceSurface.tsx` |
| H2 | Intelligence hidden when acting-as | manual | cards disappear for delegate sessions | ⬜ | `/my` top-level guard |
| H3 | Profile Copilot CTA | manual | click → suggestions render with action links | ⬜ | `ProfileCopilotCard` |
| H4 | Portfolio Copilot disabled at <2 works | manual | CTA disabled + soft hint | ⬜ | `PortfolioCopilotCard` |
| H5 | Weekly Digest empty copy | manual | with 0 views / 0 inquiries, quiet empty copy, no fake data | ⬜ | `WeeklyDigestCard` |
| H6 | Matchmaker lazy load | manual | loads top 5 peers + one sentence rationale each on mount | ⬜ | `MatchmakerCard` |
| H7 | Soft cap | manual | 30th call in 24h → 429 + `ai.error.softCap` shown | ⬜ | `ai_events` row count |
| H8 | No `OPENAI_API_KEY` | manual | CTAs still visible, press → `ai.error.unavailable`, no crash | ⬜ | remove key + reload |
| H9 | Timeout fallback | manual | server latency > 8s → `ai.error.tryLater` | ⬜ | throttle |
| H10 | Bio Draft insert | manual | empty bio → apply fills textarea, pre-filled bio → confirm prompt | ⬜ | `BioDraftAssist` |
| H11 | Bio Draft tone preset | manual | changing chip changes draft flavour on next generate | ⬜ | `BioDraftAssist` |
| H12 | Exhibition Draft (new) | manual | title / description / wall_text / invite_blurb all generate, only title applies | ⬜ | `ExhibitionDraftAssist` on `/my/exhibitions/new` |
| H13 | Exhibition Draft (edit) | manual | works list from `listWorksInExhibition` feeds the context | ⬜ | `ExhibitionDraftAssist` on `/my/exhibitions/[id]/edit` |
| H14 | Exhibition drafts not saved | manual | page reload keeps form pristine, drafts gone | ⬜ | no DB write |
| H15 | Inquiry reply draft | manual | textarea gets draft text, send button still manual | ⬜ | `/my/inquiries` |
| H16 | Inquiry follow-up toggle | manual | follow-up mode yields nudge language, not initial reply | ⬜ | `InquiryReplyAssist` |
| H17 | Artist block inquiry draft | manual | same behavior on `/artwork/[id]` | ⬜ | artist block |
| H18 | Matchmaker rationale fallback | manual | when AI degraded, each card shows `ai.matchmaker.rationaleFallback` | ⬜ | `MatchmakerCard` |
| H19 | `/people` intro draft | manual | each peer card has `연결 메시지 초안` button; click → copyable drafts, no auto-send | ⬜ | `IntroMessageAssist` |
| H20 | Public shell AI-free | manual | `/u`, `/e`, `/artwork` (viewer), feed have no AI affordance | ⬜ | visual audit |
| H21 | `ai_events` insert | sql | 1 row per route call with feature_key + latency_ms + context_size | ⬜ | `select count(*) from ai_events` |
| H22 | `ai_events` RLS | sql | anon + other user cannot read my rows | ⬜ | `ai_events_select_own` |
| H23 | `ai_accepted` client event | manual | 채택 / 복사 시 `beta_analytics_events` 에 `ai_accepted` 1행 | ⬜ | `logBetaEvent` |
| H24 | No "AI" literal in UI | manual | user-visible buttons/cards never say "AI" (tooltip only) | ⬜ | `ai.disclosure.tooltip` |
| H25 | Safety: no claim/provenance write | code | `FORBIDDEN_ACTIONS` unchanged, no route mutates claims | ⬜ | `src/lib/ai/safety.ts` |
