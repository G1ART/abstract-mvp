# Abstract — Design Spine

Status: Salon System v2 baseline (2026‑05). Updated through P6.4 (CV import vision).

This document is the **cornerstone** for how Abstract presents itself.
It is not a style sheet, it is the set of values every screen, copy
line, color choice and interaction must answer to. New surfaces must
be checked against §0 before they are designed and against §1–§9
before they ship. A PR that deviates without updating this file is
incomplete.

The companion file `docs/04_DESIGN_SYSTEM.md` is a living catalog of
the SSOT primitives (`PageShell`, `PageHeader`, `LaneChips`,
`FloorPanel`, `FilterChip`, `Chip`, `EmptyState`, `SectionLabel`,
`SectionFrame`, `ConfirmActionDialog`, skeletons). When a value here
calls for a primitive, that catalog says *which* and *how*.

---

## §0. Cornerstone — the values every surface must answer to

These are the principles that have shaped every cycle from the Living
Salon Feed to the AI-Native Studio Layer to the Profile Materials
wave. They are the answer to "is this Abstract enough to ship?"

### 0.1 Tone — quiet confidence over decoration

Abstract is for picky art-world users (artists, curators, gallerists,
collectors). Their bar is "calm, deliberate, thoughtful". We aim for a
single repeated reaction:

> "*와, 정말 섬세하고 빈틈없다, 잘 만들었다, 이런 기능은 참 사려깊다.*"

Translation in design choices:

- **Quiet, dense, image-first, relationship-aware** — work-first
  surfaces; people and exhibitions support, never overwhelm.
- **진중하고 단정하되 사려깊을 것** — serious and tidy, but considered.
  Decoration must earn its place.
- We benchmark **Pinterest / Instagram / LinkedIn** for layout
  stability and whitespace. We deliberately **do not** benchmark
  Saatchi / Artsy / 아트니스 — those feel busy by our standard.
- Aesthetic completeness is not a polish phase, it is a P0 contract.
  A feature that ships ugly is incomplete.

### 0.2 Red flags — what disqualifies a surface

These are the things that make a screen feel "amateur" and must be
caught before merge:

- 한–영 직역체 ("press the button to do action").
- Raw error codes / English fallback strings leaking into the UI
  (e.g. "no_key", "decode_failed", "Unauthorized").
- Inconsistent button radii / shape vocabulary on the same surface.
- A page that pushes its primary content (artworks, feed grid)
  *below the fold* because of an above-the-fold long body.
- Two H1s on the same surface, or a kicker + an H1 that say the same
  thing twice.
- Silent failure — a button click that does nothing visible.
- Empty surfaces that read "loading…" forever instead of a real
  empty state.

### 0.3 Primitives-first (SSOT)

Every recurring shape is owned by one primitive in
`src/components/ds/*`. Touching a hand-rolled `<main>`, `<header>`,
or `border-zinc-200 bg-zinc-50/...` panel is treated like touching
the database without an RPC — it is a code smell.

The standing primitives are catalogued in `docs/04_DESIGN_SYSTEM.md`.
Ten current primitives (P3 baseline) are: `PageShell`, `PageHeader`,
`SectionLabel`, `FloorPanel`, `LaneChips`, `FilterChip`, `Chip`,
`SectionFrame`, `EmptyState`, `PageShellSkeleton` (+ feed / list
shimmers). Adding a new shape that is reusable means adding it there
and back-filling existing surfaces, not just dropping it in one
component.

### 0.4 Persona-aware exposure

Surfaces that are persona-specific (artist statement, CV, studio
intelligence) must be **gated by persona**, never just shown to
everyone with the role available. Examples that have shaped this rule:

- A gallerist's main role is gallerist, even when they have an
  `artist` chip. They belong to the *"갤러리스트를 소개합니다"*
  cluster, not the *"작가의 세계"* row.
- Statement / CV trigger buttons render only when the viewed profile
  is an artist persona. For non-artists the buttons disappear; we
  do not render an empty Statement button on a curator's page.

Persona logic lives in `formatRoleChips` (`src/lib/identity/format.ts`)
and `isArtistRole` helpers; surfaces consume the boolean.

### 0.5 Quality-gated visibility

Public-facing rails never lower their bar to fill space:

- An exhibition with one artwork thumbnail does **not** appear in
  the Living Salon feed (presentable threshold).
- Profiles without a display name / avatar fall out of the
  Salon's front rails — they appear only in dedicated "설정 중인
  프로필" lanes inside People.
- Fields the model invents (sizes without source units, dates
  without context) are dropped, not "guessed".

When in doubt, it is better to show fewer items than to dilute the
floor.

### 0.6 Preview-first (human in the loop)

Every AI surface is a *preview*, never a side-effect. The user must
press one button to generate and a second, explicit button to apply
or send. This is enforced by the `FORBIDDEN_ACTIONS` constant in
`src/lib/ai/safety.ts`:

- AI never approves / rejects claims.
- AI never confirms provenance.
- AI never asserts ownership.
- AI never merges identities.
- AI never sends messages on the user's behalf.

The CV Import wizard (P6.2–P6.4) is the canonical example: the LLM
output is shown as an editable preview with category dropdowns,
inline fields, duplicate badges, and add-vs-replace mode. Nothing
is written to the `profiles` jsonb columns until the user presses
**Save to CV**.

### 0.7 Loose-key preservation (never silent-drop)

When normalizing model output or validating user data, fields we
*don't recognize* must be preserved, not silently dropped. This is
how the CV editor renders extra fields a future import flow might
add, and how identity / profile updates avoid clobbering data
introduced by a parallel migration.

The contract is: drop only what is empty or known-junk. Anything
else flows through.

### 0.8 Concept naming over generic labels

Section names are deliberate concepts, not generic tab words.

- The feed is **오늘의 살롱 / Today's Salon**, not "discovery feed".
- Artist intro rail is **작가의 세계 / The Artist's World**.
- Curator rail is **큐레이터를 만나보세요 / Meet the curator**.
- The CV import flow is **이력 자동 가져오기 / Import CV**, not
  "AI scan".

When a label exists in `messages.ts` with a stable concept name, the
literal English / Korean strings are forbidden in the JSX.

---

## §1. Shell

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
6. `StudioMaterialsPanel` (artist persona only) — entry cards for
   Artist Statement (→ `/settings#statement`) and CV (→
   `/my/profile/cv`). Each card shows a status line (character
   count / entry count) without ever pretending the surface is full
   when it is empty.
7. `StudioViewsInsights` — condensed last‑7‑day views + recent viewers
   preview; the full experience lives under `/settings`.
8. `StudioPortfolioPanel` — persona tabs, reorder mode, bulk delete.
9. `StudioIntelligenceSurface` — intelligence hierarchy (see §1.5).

Non‑negotiables:

- No feature may be removed when the shell is rewritten; it can only be
  moved under one of the section entries.
- The Studio shell never shows copy that reads "coming soon" or
  "placeholder" in production.

### 1.3 Sub‑page shell

Sub pages under `/my/*` follow the same skeleton: a one‑sentence intro,
a status/filter strip, and list UI. Empty states are always single
sentences with an implicit next action.

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
- `CvImportWizard` in `/my/profile/cv` (P6.2–P6.4) — URL / PDF / DOCX /
  image / scanned-PDF input, four-step flow (idle → running →
  preview → saving), dedup pass against existing CV, education
  enum normalization, automatic vision fallback for scanned PDFs.

Copy rule: avoid the literal word **"AI"** in user‑facing surfaces. Use
action language ("소개문 초안", "답장 초안 받기", "연결 메시지 초안",
"이력 자동 가져오기"). `ai.disclosure.tooltip` is the only place the
nature of the helper is named, and it lives in tooltip text.

---

## §2. Identity

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

### 2.1 Shared UI primitives

All section shells, card frames, empty states and role/status badges
must come from `src/components/ds/*` (catalogued in
`docs/04_DESIGN_SYSTEM.md`):

- `SectionFrame` — the rounded‑2xl bordered container used by every
  Studio and sub‑page section (tones: `default`, `muted`, `dashed`).
- `SectionTitle` — eyebrow + heading + optional trailing action.
- `EmptyState` — single‑sentence empty state with optional primary /
  secondary actions. Replaces ad‑hoc `py‑8 text‑center` paragraphs.
- `Chip` — neutral / accent / warning / success / muted pill used for
  role labels, status badges, reason tags.

New surfaces must not hand‑roll `rounded-lg border border-zinc-200`
card shells; reach for `SectionFrame` or `FloorPanel` instead.

---

## §3. Cards

### 3.1 Artwork card

Information hierarchy: artist → title → year/medium → price chip.
The artist block carries the identity pair, primary role chip, and
(where applicable) a Follow button.

**Size pill** (P2/P3 lessons): an opaque overlay tag carrying the
work's real size. The size pill renders only when we can confidently
state the unit — explicit cm / inch in metadata, *or* a Korean canvas
호수 from which cm can be inferred. **Never fabricate a unit**:
ambiguous numerics (`30 × 40` with no unit) get *no* pill rather than
a guessed cm. Thumbnail size must never mislead the viewer about the
real size of the work.

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

### 3.4 People cluster (LinkedIn-style horizontal rail)

Persona-specific people recommendations (Curator rail, Gallerist rail,
Artist rail) render as a **clustered horizontal carousel** — never as
a full-width single card per row. Pattern (mirrors LinkedIn's "Jobs
recommended for you"):

- Multiple compact cards in a single horizontal scroller.
- Avatar + identity pair + primary role chip + Follow button below.
- The Follow button is the same surface as the People-tab Follow:
  it opens the message-draft sheet (which lets the user send with
  no message too).

This keeps people sections from devouring vertical real estate that
the work-first feed needs.

### 3.5 Modal trigger pattern (Statement / CV)

Long-body sections that would push the page grid below the fold use
the **modal trigger** pattern:

- The page surfaces a **single compact button** (e.g. "Artist
  Statement", "CV") above the artwork tab strip. The button is small,
  high-contrast, and never carries a teaser / thumbnail.
- Clicking opens an in-page modal lightbox (ESC + click-outside +
  focus management + scroll lock).
- The body lives inside the modal, never inline in the public profile.

This is how the public profile keeps work as the primary surface
while still surfacing the artist's statement and CV with one click.

---

## §4. Copy

- Every surface passes through `useT()`. The keys live in
  `src/lib/i18n/messages.ts` with matching `en` and `ko` entries.
- Provenance labels render through `provenanceLabel(kind, t)`. Raw claim
  types never reach the UI.
- Acting‑as attribution is surfaced by a single `ActingAsBanner` at the
  top of the page. Individual pages never render their own banner.
- Korean copy reads as native Korean, English copy as native English.
  **Translation-by-template ("press the button to do X") is a red
  flag**; rewrite both sides until they read like a copywriter wrote
  them, not a translator.
- Error messages map to `*.error.*` keys. The model's stable error
  enums (`no_key`, `cap`, `parse`, `unauthorized`, `invalid_input`,
  `extractError: pdf_empty`, …) are mapped to friendly copy at the
  edge of the surface; they never reach the user as a raw string.

---

## §5. Spacing and color

- Card radius: `rounded-xl` for inner cards, `rounded-2xl` for section
  shells. **Buttons that act as primary CTAs are `rounded-full`**;
  secondary buttons in primary flows (Cancel, Back, Reorder) follow
  the same radius for the platform to read coherent. Form input
  fields stay rectangular.
- Vertical rhythm in Studio: 24 px between sections, 12 px within.
- Tone of the neutral palette: `zinc`. Single floor-tint opacity
  `bg-zinc-50/70` (set by `FloorPanel`); earlier `/50` `/60` `/70`
  variants were absorbed.
- Status semantic colors:
  - **amber** — action pending / warning / soft notice
    (e.g. duplicate-detected badge in CV import).
  - **emerald** — public / active / success.
  - **rose** — accent / hover / favorite.
  - **red** — destructive / error.
  - **zinc** — neutral, default.

Cards stay on white over a soft floor tint; tinted cards (other than
neutral white over `bg-zinc-50/70`) need explicit justification.

---

## §6. Surface composition rules

These are operational rules, learned the hard way over the design
unification cycles (P0–P4.1) and the Profile Materials wave (P5–P6.4).
Every page audit checks these.

### 6.1 One H1 per surface

Every page surface has exactly one H1. Sub-page navigation (Upload's
single / bulk / exhibition modes, Studio's section nav) does not get
its own H1 — the parent surface already owns the identity. Lessons
from P4.1 codified this for the Upload tabs, where each subpage used
to render its own H1 ("업로드", "일괄 업로드", "전시 게시물 만들기")
and fragmented the page identity.

### 6.2 Header order: H1 → lead → LaneChips

When a page has both editorial header and a lane / segmented switch,
the order is always:

```
PageHeader (H1 + lead)
    ↓
LaneChips
    ↓
content
```

Feed, People, Upload, My Studio, Public Profile all follow this. A
LaneChips above the H1 is a regression.

### 6.3 Kicker — page_or_strip policy

The `editorial` PageHeader kicker (uppercase tracking-[0.22em] + 2px
accent) is **either** a page-level identity label **or** a strip-level
identity label, **never both on the same surface**. Inside a page
that already owns the kicker, sub-section eyebrows demote to
`SectionLabel` (lighter tracking, `text-zinc-500`, no accent line).

If you find yourself wanting a second kicker on the same page,
rename it to `SectionLabel` — that is what it is.

### 6.4 Single floor-tint opacity

`bg-zinc-50/70` everywhere. Hand-rolled `/50`, `/60`, or `/80`
variants drift, and one drift creates two visible tones on the same
page that read as "two different products glued together". `FloorPanel`
owns this single value.

### 6.5 Modal lightbox for long bodies

Long-body content that would push the primary grid below the fold
(artist statement with hero image, full CV) goes into a modal
lightbox triggered by a compact button above the grid. **The
public profile main page never renders an inline long body that
displaces the artwork tabs.** (See §3.5.)

### 6.6 Persona-gated sections

Sections that only make sense for a specific persona (artist
statement, CV, Studio intelligence) **render conditionally on the
persona check** (e.g. `isArtistRole(profile)`), not unconditionally.
Empty-state copy assumes the persona; we do not show "Add CV" to a
gallerist profile.

### 6.7 Quality-gated rails

Public-facing rails (Living Salon strips, People recommendations)
filter for a quality threshold before sorting:

- Exhibitions need ≥ N artwork thumbnails to enter the salon strip.
- Profiles need a display name + presentable thumbnail to enter the
  Salon front.
- An item the algorithm cannot rank with confidence is dropped, not
  surfaced "to fill space".

### 6.8 Skeletons match the shell

Suspense fallbacks use `PageShellSkeleton` with the matching variant
so the swap to real content is **geometrically invisible** — no
header jump, no width change, no padding shift. In-tab loading uses
`FeedGridSkeleton` / `ListCardSkeleton` so the page header stays
painted while the body refreshes.

### 6.9 Single ActingAsBanner

When the user is acting on behalf of another profile, attribution is
surfaced once, by the global `ActingAsBanner` at the top of the page.
Individual pages never render their own banner, intelligence cards
hide themselves entirely (see §1.5), and write-RPCs carry the
delegation header.

---

## §7. Accessibility

- Toggles must be real `button` elements with `role="switch"` and
  `aria-checked`.
- Lane / segmented switches expose `aria-pressed` (LaneChips) or
  `aria-current="page"` (when rendered as `<Link>`).
- Live regions (acting‑as, toast) use `aria-live="polite"`.
- All tappable cards must be keyboard activatable (Enter/Space).
- Modal lightboxes (Statement / CV / ConfirmActionDialog) handle
  ESC, click-outside, focus trap, and scroll lock as a single
  primitive (`ConfirmActionDialog` for destructive confirm,
  `SurfaceModal` pattern in `ProfileSurfaceCards` for read-only
  body modals).
- Every interactive element renders a focus-visible ring; default
  Tailwind ring is too pale — use `focus-visible:ring-2
  focus-visible:ring-zinc-900`.

---

## §8. Information accuracy

We never fabricate or guess on the user's behalf. This shaped several
design decisions:

- **Identity formatter** (§2) is the SSOT; no surface invents a
  display name.
- **Size pill** (§3.1) only renders when the unit is reliably known
  or inferable from a 호수.
- **Persona / role chips** come from `formatRoleChips`; a profile
  with role data we don't recognize gets *no chip* rather than a
  guessed label.
- **Loose-key preservation** (§0.7) — the manual CV editor and the
  AI import preview both retain unknown keys so a future field
  addition does not silently nuke data.
- **AI normalizer post-process** — model output that names a category
  / enum we don't know (e.g. `education.type: "Bachelor of Fine
  Arts"`) is *snapped to a slug* (`bfa`) when the mapping is clear,
  *dropped* when ambiguous; we never show the raw junk label in the
  editor.
- **Duplicate detection** — when imported CV entries match the user's
  existing entries, we **skip them by default** rather than
  double-writing. The user can include them back, but the safe
  default is preservation.

---

## §9. Workflow patterns

These are the canonical patterns for multi-step user flows. Reuse
them rather than inventing a shape per surface.

### 9.1 Wizard (4-step)

Used by `CvImportWizard`. Four states with named transitions:

1. **idle** — input options, Cancel collapses back into the trigger
   card.
2. **running** — work in flight; rotating status copy so the user
   sees progress without a fake progress bar.
3. **preview** — model / server output as an editable preview.
   Per-item edit + remove, header-level mode toggle (add vs
   replace), automatic auto-skip for items that look like duplicates
   of existing data, save button disabled when nothing is included.
4. **saving** — RPC in flight; same visual idiom as `running`.

After a successful save the wizard collapses back to the trigger
card and the editor refreshes its baseline.

### 9.2 Bulk preview-edit grid

Used by `/upload/bulk` and the CV import preview. Each row is
inline-editable, one bulk action header (apply title across rows,
delete selected, publish selected). Rows the user has marked for
skip are dimmed (60% opacity) and disabled, never removed from the
grid — the user must be able to bring them back.

### 9.3 Confirm-before-destructive

Any action that destroys data routes through `ConfirmActionDialog`:
ESC + click-outside + focus management built in. The CTA text says
what will happen ("Delete 12 works", "Replace existing CV") not
just "Confirm".

### 9.4 Server → server-vision automatic fallback

Established by the CV import P6.4 pattern. When a server-side
extractor returns an empty result that signals a different input
shape (e.g. `pdf-parse` empty text on a scanned PDF), the response
carries a `visionFallback: true` hint and the wizard automatically
re-prepares the input client-side and re-submits. The user sees a
small banner ("Looks like a scanned PDF — switching to image
mode") rather than a blunt error.

This pattern generalizes: any extractor that has a graceful
secondary path should signal it via a `*Fallback: true` flag in
the degraded response, and the client should handle the retry
without making the user re-pick the file.

---

## §10. Deviations

New surfaces that deviate from this document require a short note in
`docs/CHANGELOG.md` and an update here. A PR that deviates without
an update is incomplete.

When a recurring shape is discovered during a cycle, *promote* it:

1. Add a primitive (or extend an existing one) under
   `src/components/ds/*`.
2. Add a one-paragraph entry in `docs/04_DESIGN_SYSTEM.md`.
3. Back-fill the existing surfaces that hand-rolled it.
4. If the shape implies a *value* (a "we do X this way because Y"),
   add a §-level rule here.

A primitive added but never back-filled is a half-finished primitive.
A value codified here but not enforced in any surface is a
half-codified value. Both are PR-blocking.
