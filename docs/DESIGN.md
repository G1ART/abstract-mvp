# Abstract — Design Spine

Status: AI-Native Studio Layer wave 1 baseline (2026‑04)

This document is the single source of truth for how the Abstract product
presents itself. Every new screen or component must be checked against it.
It replaces ad‑hoc choices that accumulated during the MVP period.

## 1. Shell

The app is split into three shells that are deliberately different.

### 1.1 Public shell

- Header is intentionally light; it never carries brand moments or ads.
- The primary content block owns the attention (feed card, artwork,
  profile, exhibition).
- Anonymous users see the same shell as members; the difference is the
  absence of the Studio entry in the header.

### 1.2 Studio shell (`/my`)

The Studio shell is profile‑first. It mirrors what a visitor would see on
the artist's public page, then augments it with authority features.

Order from top of viewport:

1. `StudioHero` — identity (name, handle, role chips), privacy flag,
   completeness bar, **Edit profile** and **Preview public** CTAs.
2. `StudioSignals` — last‑7‑day profile views, follower delta, unread
   inquiries, pending claims. Entitlement‑locked signals carry the
   upsell copy instead of a real value; they never fake a number.
3. `StudioNextActions` — the priority engine turns the current state of
   the profile, inbox and ops into the next 1‑4 nudges.
4. `StudioQuickActions` — supplemental one‑line CTA rail (upload, new
   exhibition, open public). It never duplicates the Next Actions.
5. `StudioSectionNav` — deep links to Portfolio, Exhibitions, Inbox,
   Network, Operations. Each card shows a count and optional badge.
6. `StudioViewsInsights` — condensed last‑7‑day views + recent viewers
   preview; the full experience lives under `/settings`.
7. `StudioPortfolioPanel` — persona tabs, reorder mode, bulk delete.
8. `StudioIntelligenceSurface` — intelligence hierarchy (see §1.5).

Non‑negotiables:

- No feature may be removed when the shell is rewritten; it can only be
  moved under one of the section entries.
- The Studio shell never shows copy that reads "coming soon" or
  "placeholder" in production.

### 1.4 Trust boundary

Abstract is a human‑centered platform. The model never speaks with authority:

- No AI result is allowed to approve / reject a claim, confirm provenance,
  assert ownership, merge identities, or send outbound messages. The
  `FORBIDDEN_ACTIONS` constant in `src/lib/ai/safety.ts` enumerates these.
- Every AI surface is an editable preview. The user must press a button to
  generate, and a second, explicit action to apply or send. Drafts are
  never auto‑inserted over existing user text; overwrite requires a
  confirm prompt.
- AI surfaces are confined to the Studio shell (`/my`) and the Settings /
  Exhibition / Inquiry / People authoring flows. Public shell pages
  (`/u`, `/artwork`, `/e`, feed) carry no model output.

### 1.5 Studio intelligence hierarchy

The intelligence area appears once per `/my` view (hidden when the user is
acting on behalf of another profile) and composes four cards in this order:

1. **Profile Copilot** — completeness number + 2‑4 missing points +
   1‑3 concrete next actions linking back to Settings / Upload / etc.
2. **Portfolio Copilot** — reorder hints, series suggestions, missing
   metadata, exhibition‑link opportunities. Suggestions never persist —
   they link to the existing edit / reorder surfaces.
3. **Weekly Digest** — one‑line headline, 2‑3 change bullets, 1‑2 next
   moves. Quiet copy when inputs are mostly zero; never fabricates
   momentum.
4. **Matchmaker Lite** — top 3‑5 people from `likes_based` lane plus a
   one‑sentence rationale per card. Ranking stays with
   `getPeopleRecommendations`; AI only produces the rationale sentence.

Each card has exactly one primary CTA (generate / refresh), preview body,
and optional per‑row action links. Error, soft‑cap, and no‑key states use
`ai.error.*` / `ai.state.*` copy — never silent failure.

### 1.6 AI assist CTAs in workflows

Workflow AI assist appears inline with the relevant input field:

- `BioDraftAssist` under the Settings bio textarea.
- `ExhibitionDraftAssist` under the exhibition title field in
  `/my/exhibitions/new` and `/my/exhibitions/[id]/edit`. Four kinds:
  `title`, `description`, `wall_text`, `invite_blurb`. Drafts are
  edit/copy only — Wave 1 does not persist description or wall text.
- `InquiryReplyAssist` under the reply textarea in `/my/inquiries` and
  the artist block of `/artwork/[id]`. Supports tone preset and
  follow‑up toggle. Drafts insert into the reply state; a human still
  presses **Send**.
- `IntroMessageAssist` on `/people` recommendation cards. Produces a
  draft the user copies, then sends themselves outside the card.

Copy rule: avoid the literal word **"AI"** in user‑facing surfaces. Use
action language ("소개문 초안", "답장 초안 받기", "연결 메시지 초안").
`ai.disclosure.tooltip` is the only place the nature of the helper is
named, and it lives in tooltip text.

### 1.3 Sub‑page shell

Sub pages under `/my/*` follow the same skeleton: a one‑sentence intro,
a status/filter strip, and list UI. Empty states are always single
sentences with an implicit next action.

## 2. Identity

Identity is rendered through a **single formatter module**:
`src/lib/identity/format.ts`. No component may call `profile.display_name`
directly.

- `formatDisplayName` returns the best human label (display_name ▸
  `@username` ▸ fallback).
- `formatUsername` returns `@handle` or `null`.
- `formatIdentityPair` returns `{ primary, secondary }` used by all cards.
- `formatRoleChips(profile, t, { max })` returns ordered role chips with
  the primary role at index 0 and a `isPrimary` flag.

Role keys are closed: `artist`, `curator`, `collector`, `gallerist`.
Every label must pass through `roleLabel(key, t)` in
`src/lib/identity/roles.ts` and the `role.*` keys in
`src/lib/i18n/messages.ts`. No hard‑coded English strings.

## 2.1 Shared UI primitives

All section shells, card frames, empty states and role/status badges
must come from `src/components/ds/*`:

- `SectionFrame` — the rounded‑2xl bordered container used by every
  Studio and sub‑page section (tones: `default`, `muted`, `dashed`).
- `SectionTitle` — eyebrow + heading + optional trailing action.
- `EmptyState` — single‑sentence empty state with optional primary /
  secondary actions. Replaces ad‑hoc `py‑8 text‑center` paragraphs.
- `Chip` — neutral / accent / warning / success / muted pill used for
  role labels, status badges, reason tags.

New surfaces must not hand‑roll `rounded-lg border border-zinc-200`
card shells; reach for `SectionFrame` instead.

## 3. Cards

### 3.1 Artwork card

Information hierarchy: artist → title → year/medium → price chip.
The artist block carries the identity pair, primary role chip, and
(where applicable) a Follow button.

### 3.2 Exhibition card

Credits (curator / host) render **above** the exhibition title. The card
anchors the exhibition to its people first.

### 3.3 People card

Uses `formatIdentityPair` plus role chips. Recommendation reason goes
through `reasonTagToI18n` so that `follow_graph`, `likes_based`, etc.
become user‑facing sentences. All recommendation and search surfaces
call `getPeopleRecommendations` in `src/lib/supabase/recommendations.ts`
exclusively — `searchVariant: "merged"` gives the name + artwork merged
lane, `"name_only"` keeps the legacy name search. Consumers do not
import `getPeopleRecs` or `searchPeopleWithArtwork` directly.

## 4. Copy

- Every surface passes through `useT()`. The keys live in
  `src/lib/i18n/messages.ts` with matching `en` and `ko` entries.
- Provenance labels render through `provenanceLabel(kind, t)`. Raw claim
  types never reach the UI.
- Acting‑as attribution is surfaced by a single `ActingAsBanner` at the
  top of the page. Individual pages never render their own banner.

## 5. Spacing and color

- Card radius: `rounded-xl` for inner cards, `rounded-2xl` for section
  shells.
- Vertical rhythm in Studio: 24 px between sections, 12 px within.
- Tone of the neutral palette: `zinc`. Amber = action pending, emerald =
  public/active, red = error/reject.

## 6. Accessibility

- Toggles must be real `button` elements with `role="switch"` and
  `aria-checked`.
- Live regions (acting‑as, toast) use `aria-live="polite"`.
- All tappable cards must be keyboard activatable (Enter/Space).

## 7. Deviations

New surfaces that deviate from this document require a short note in
`docs/CHANGELOG.md` and an update here. A PR that deviates without an
update is incomplete.
