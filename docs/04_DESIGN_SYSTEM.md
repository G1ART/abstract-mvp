# 04 — Design System (Salon System v2)

A short decision guide for the SSOT primitives that make every Abstract
page read as one coherent salon, not five different products glued
together. Read this *before* reaching for a hand-rolled `<main>`,
`<header>`, or `border-zinc-200 bg-zinc-50/...` panel.

This file is the **how** companion of `docs/DESIGN.md`. `DESIGN.md`
holds the *values* every surface must answer to (tone, anti-patterns,
persona awareness, preview-first, loose-key preservation, surface
composition rules); this file holds the *primitives* that those
values resolve into.

The primitives live under `src/components/ds/`. Pattern conventions
that aren't single primitives (modal triggers, materials cards,
vision-fallback retry) are catalogued at the bottom of this file.

## 1. PageShell — page width, padding, vertical rhythm

`PageShell` is the *only* place page width / horizontal padding / vertical
rhythm should be expressed. Variants:

| variant | width            | when to use                                    |
| ------- | ---------------- | ---------------------------------------------- |
| `feed`  | `max-w-[1200px]` | only the Living Salon feed                     |
| `default` | `max-w-3xl`    | most index / list / browse surfaces            |
| `narrow`  | `max-w-2xl`    | focused single-column forms (single upload, invite) |
| `studio`  | `max-w-5xl`    | operator dashboards (My Studio, Upload chrome) |
| `library` | `max-w-6xl`    | wide tabular surfaces                          |

Horizontal padding is always `px-4 sm:px-6`. Vertical is always
`py-8 sm:py-10 lg:py-14`. Optional `topAccessory` slot mounts a right-aligned
TourHelpButton row above the page header.

Anti-pattern: a page that opens with `<main className="mx-auto max-w-2xl px-6 py-10">`. That's PageShell's job.

## 2. PageHeader — kicker / h1 / lead

Two variants:

- **`editorial`** — kicker (uppercase tracking-[0.22em] + 2px accent) + h1 + lead. Reserved for surfaces whose identity benefits from a category label. **At most ONE editorial kicker per surface** — child sections must use `SectionLabel`, not another kicker.
- **`plain`** — h1 + lead. The default for surfaces whose identity is already obvious from navigation (Feed, Upload, My Studio, public profile, People).

H1 is always `text-2xl font-semibold tracking-tight text-zinc-900`. No
exceptions; this is what makes the platform read as a coherent set.

`actions` slot mounts a right-aligned button (TourHelpButton, peripheral
links). `density="tight"` reduces the bottom margin from `mb-8` to `mb-6`
when stacked above a chip rail.

## 3. SectionLabel — quiet sub-section labels

Used inside a page surface where the editorial kicker would over-decorate.
Visual weight one notch below the kicker:

- lighter tracking (`tracking-wide`)
- softer color (`text-zinc-500`)
- no accent line

Examples: trending lane header, role filter prefix, carousel rails inside
a page that already owns the kicker.

For *strip-level* headers that live as their own meaning unit (the Living
Salon strips), the editorial kicker is still the right tool — those
strips ARE the meaning unit, not a sub-section of one.

## 4. FloorPanel — soft, floor-tinted container

`rounded-2xl bg-zinc-50/70` over `padding="sm" | "md" | "lg"`. Used to
mark a different unit on the page (a recommendation rail, an empty-state
explainer, a trending shelf) without shouting. Single opacity (`/70`) on
purpose — earlier surfaces sprinkled with `/50` `/60` `/70` are now all
absorbed by this primitive.

Anti-pattern: re-inventing a `rounded-2xl bg-zinc-50/60 px-5 py-6` panel
inline. Reach for `<FloorPanel>`.

## 5. LaneChips — lane / segmented switch

Single source of truth for "lane / segmented" pill groups — the toggle
that switches between recommendation lanes (Follow graph / Likes-based /
Expand) or portfolio sections (Works / Exhibitions / Notes) or upload
tabs (Single / Bulk / Exhibition).

Two visual densities, one shape language:

- **`lane`** — large pill (text-sm), used for primary lane switches.
- **`sort`** — compact pill (text-xs), used for secondary toggles inside a header strip.

Both render `aria-pressed` on the active button. Options can carry an
`href` to render as a `<Link>` (with `aria-current="page"`) instead of a
button — Upload tabs use this.

## 6. FilterChip — multi-select toggle

For *toggle filters* (multiple chips active at once), e.g. role filters
on People. Single pill, `rounded-full px-3 py-1 text-sm` + `aria-pressed`.

When a chip can be active alongside others, use `FilterChip`. When the
chips are mutually exclusive (lane / portfolio section), use `LaneChips`.

## 7. Chip — inline label / badge

`Chip` is the SSOT for the small inline label pill: role chips on a
profile, public/private badges, "ready" / "missing" status pills.

Sizes: `xs` (text-[10px], dense card metadata), `sm` (text-[11px], the
default for list cards and hero badges).
Tones: `neutral` · `accent` · `warning` · `success` · `muted`.

For *toggle filters* use `FilterChip`. For *lane switches* use
`LaneChips`. `Chip` is read-only.

## 8. PageShellSkeleton + FeedGridSkeleton + ListCardSkeleton

`PageShellSkeleton` is the Suspense fallback for first-render. Variant
matches `PageShell` so the swap is geometrically invisible.

`FeedGridSkeleton` and `ListCardSkeleton` are *in-tab* shimmers — the
parts you render after the page header is already painted but the body
is repopulating. `PageShellSkeleton` itself uses these two under the
hood.

## 9. EmptyState — single-sentence empty surface

`EmptyState` is the canonical "single sentence + optional CTA" empty
state. CTA radius is `rounded-full` — same as every other primary CTA.

For empty surfaces that need *more than a sentence* (e.g. delegations
needs two explainer cards alongside the CTA), build a page-local panel
that *uses the FloorPanel surface tone* and rename it explicitly (e.g.
`DelegationsEmptyPanel`) so it doesn't shadow the DS primitive. Don't
inline a second `EmptyState` definition.

## 10. CTA radius

All primary CTAs are `rounded-full`. Period. Secondary buttons in primary
flows (Cancel, Back, Reorder) follow the same radius for the platform to
read coherent. Form input fields stay rectangular (`rounded` /
`rounded-xl`) — those are not CTAs.

---

## Patterns (not single primitives, but shared shapes)

### P1. Modal trigger for long bodies (Statement / CV)

**Source: P5 (Profile Surface Cards).** When a section's body would
otherwise push the primary grid (artwork tabs) below the fold, the
trigger pattern is:

1. A single compact button rendered above the artwork strip, no
   teaser thumbnail, no excerpt. Pair: Statement + CV.
2. The button opens an in-page modal lightbox (`SurfaceModal`-style:
   ESC + click-outside + focus trap + scroll lock).
3. The body lives entirely inside the modal — never inline on the
   public profile.

The two buttons live in `ProfileSurfaceCards` and are rendered only
for artist personas. Owners of an empty section see "Write
statement" / "Add CV" prompts that link to the editor; visitors see
nothing for empty sections.

### P2. Materials cards on /my (Profile Materials)

**Source: P6.1.** Studio entry cards for surfaces that are too large
to embed inline but too important to bury. Each card carries:

- One-line title (e.g. "Artist statement").
- Status pill ("Saved · 380자" / "Empty").
- Right chevron, full card surface clickable, deep-link to the
  editor route (`/settings#statement` or `/my/profile/cv`).

The panel itself is persona-gated (artist only) and lives in the
Studio shell between the section nav and the views insights row.

### P3. Wizard (4-step preview-and-apply)

**Source: P6.2.** The canonical multi-step flow shape. States: idle
→ running → preview → saving. Specifically:

- **idle**: input form, primary CTA, Cancel collapses back.
- **running**: rotating status copy, no fake progress bar.
- **preview**: editable result with per-item controls + header-level
  mode toggle (add vs replace) + duplicate auto-skip + save disabled
  if nothing included.
- **saving**: same visual idiom as running, single in-flight RPC.

Reused by `CvImportWizard`. Future bulk operations should reach for
the same shape rather than inventing a step pattern.

### P4. Server → vision automatic fallback

**Source: P6.4.** When a server-side extractor cannot recover the
expected shape (e.g. pdf-parse on a scanned PDF), the route returns
`degraded: true` plus a `*Fallback: true` flag. The client wizard:

1. Notices the flag.
2. Renders a small amber banner ("Looks like a scanned PDF — switching
   to image mode").
3. Prepares the alternate input client-side (here: pdfjs-dist →
   PNG).
4. Re-submits without making the user re-pick the file.

This is the canonical "graceful degradation with a second pipe"
pattern. New extractors that have a secondary path should signal
it the same way.

### P5. Editor + sticky save bar

**Source: P6.1 (`CvEditorClient`).** When an editor page tracks
client-side dirty state against a baseline:

- Inline CRUD with per-item add / remove.
- Sticky bottom save bar carries: discard button, save button,
  status copy ("Unsaved changes" / "Saving…" / "Saved" / error).
- Save button disabled until dirty; discard button disabled when
  clean.
- Sanitization (drop empty rows) at save time, not render time, so
  the user can momentarily have an empty row open while typing.

### P6. Persona-gated surfaces

**Source: P5–P6 throughout.** Surfaces that are persona-specific
(artist statement, CV, studio intelligence) read `isArtistRole` (or
the equivalent boolean) at the parent and render `null` when the
persona doesn't match — no empty state, no disabled state. The card
or trigger doesn't exist for non-artists.

This keeps gallerist / collector / curator profiles from carrying
ghost UI for a feature that isn't their workflow.

### P7. Quality-gated rails

**Source: P3 (Living Salon v1.5–v1.7.1).** Public-facing rails
(salon strips, people clusters) apply a presentable filter
*before* sorting:

- Exhibitions need ≥ N artwork thumbnails.
- Profiles need a display name + avatar / cover.
- Items the algorithm cannot rank with confidence are dropped.

This is enforced at the data layer (`getPeopleRecommendations`,
`getSalonFeed`); UI consumers do not re-filter.
