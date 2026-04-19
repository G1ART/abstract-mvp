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
| G4 | `supabase db push` | manual | all 4 migrations applied | ⬜ | staging |
| G5 | PR description links this file | manual | checked | ⬜ | PR body |
