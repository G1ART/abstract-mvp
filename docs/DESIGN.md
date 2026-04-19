# Abstract — Design Spine

Status: Mega Upgrade baseline (2026‑04)

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
4. `StudioSectionNav` — deep links to Portfolio, Exhibitions, Inbox,
   Network, Operations. Each card shows a count and optional badge.
5. Existing portfolio/tabs UI (unchanged while we migrate the sub pages).

Non‑negotiables:

- No feature may be removed when the shell is rewritten; it can only be
  moved under one of the section entries.
- The Studio shell never shows copy that reads "coming soon" or
  "placeholder" in production.

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
become user‑facing sentences.

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
