# Persona Action Grammar

Sprint 6 Phase A — Product foundation document.

## 1. Why this document exists

Abstract is not a checkout-first marketplace, not a generic CRM, and not
another portfolio site. It is a fine-art operating network: a calm,
relationship-aware, record-centered platform.

The art world does not standardize. An artist may also be a curator. A
curator may also collect. A gallery may also show external artists. A
collector may also exhibit. A user can move between these contexts in
the same week, sometimes the same day.

A traditional CRM forces a person into a fixed pipeline (lead →
prospect → conversion → customer). Abstract refuses that mental model.

## 2. Core principle

> Abstract should not standardize the art world into a rigid CRM
> pipeline. It should translate ambiguous art-world relationships into
> small, respectful, repeatable product actions.

This document defines the small, respectful, repeatable vocabulary.

## 3. Persona vs. mode

| Concept | Definition | Example |
|---|---|---|
| **Persona** | A long-lived self-description (often plural). | "I am an artist and a curator." |
| **Mode** | A current intent context for *today*. | "Today I am preparing a private viewing." |

We model **modes**, not personas. The same operator can be in any
mode at any time. Modes are never required and never permanent. There
is no "primary role" or "primary persona" enforced anywhere in the
data model.

In code, see `src/lib/persona/actionGrammar.ts`:

```ts
type PersonaMode =
  | 'artist'
  | 'gallery'
  | 'curator'
  | 'collector'
  | 'multi_persona';
```

`multi_persona` is the safe default for any operator who has not
selected a mode (or who has selected more than one).

## 4. First-value paths

For each mode, the product offers a small set of first-value paths.
A first-value path is the smallest, most specific thing this mode
could do today that would feel meaningful in the art world — *not*
the most monetizable thing.

### 4.1 Artist

- **Record a first work** — give the studio a physical anchor.
- **Prepare a private viewing** — assemble a small room for a guest.
- **Review relationships** — see who has reached out recently.

### 4.2 Gallery

- **Organize inventory** — give the wall a quiet record.
- **Share a private room** — send a viewing packet to a collector.
- **Review requests** — respond to access requests with care.

### 4.3 Curator

- **Assemble a viewing** — pull works into a private room for a guest.
- **Continue a relationship** — open a relationship card, leave a note.

### 4.4 Collector

- **Discover and save** — quietly bookmark works as you browse.
- **Ask about a work** — open an inquiry that reaches the artist.
- **Follow an artist** — keep tabs without performance.

### 4.5 Multi-persona

- **Continue a recent relationship** — open the relationship desk.
- **Organize my works** — return to your own studio.
- **Discover and save** — switch into reader mode.

Each card maps to a deterministic route + telemetry event (no AI
ranking, no scoring). See `FIRST_VALUE_PATHS` in
`src/lib/persona/actionGrammar.ts`.

## 5. Allowed vocabulary

Use language like:

```
Relationship context
Previous conversations
Shared rooms
Interested works
Approved viewers
Private preview
Studio circle
Owner private note
Suggested next step
```

## 6. Forbidden vocabulary

Never introduce:

```
Lead
Prospect
High-value buyer
Conversion
Pipeline velocity
Buyer intent score
Surveillance
Tracked viewer
Hot collector
```

These terms are explicitly checked in
`tests/persona-grammar.test.ts` against `FORBIDDEN_PERSONA_TERMS` so
they cannot leak into `actionGrammar.ts`.

## 7. Telemetry principles

- Persona action card clicks fire `persona_action_card_clicked` with
  payload `{ surface, action_kind }`. Never include the user's mode as
  a permanent attribute — modes are *intents*, not categories.
- Relationship Desk events (`relationship_desk_viewed`,
  `relationship_card_opened`, `relationship_private_note_saved`,
  `relationship_next_action_clicked`) follow the standard payload
  allowlist (`surface`, `subject_type`, `subject_id`, `field_key`,
  `action_kind`, `relationship_status`, `request_type`, `status`).
- **Forbidden payload keys:** `token`, `share_token`, `magic_link`,
  `authorization`, `cookie`, `bearer`, `email`, `invite_email`,
  `message`, `note`, `private_note`, `raw_price`, `price_input_amount`,
  `room_note`, `collector_name_freeform`. Enforced by
  `tests/privacy-token-audit.test.ts`.

## 8. How this informs Sprint 6

Sprint 6 builds the surfaces that *act* on this grammar:

- **Relationship Desk (`/my/relationships`)** is the central surface for
  the `open_relationship` and `follow_up` verbs.
- **Relationship Card** wires `add_private_note`, `approve_access`,
  `decline_access`, `share_room`.
- **Private Room v2** anchors `share_room`, `request_access`, and
  `ask_about_work` from the room itself.
- **Access Grant Lifecycle** lets `approve_access` carry calm
  granularity (per-field, per-work, per-room, time-bound) without
  inventing a permission console.

## 9. Future sprints

Sprint 7 should add explicit "what are you trying to do today?" cards
to the Studio hub if the optional UI seed proved low risk this sprint.
Sprint 7+ should also start measuring activation against
`successSignal` strings, NOT against signups or page views.

## 10. Anti-goals

This grammar is **not**:

- a permissions system (use `visibility_*` and `access_*`),
- a notification system,
- a marketing funnel,
- a sales scoring rubric,
- a way to force a user into one role.
