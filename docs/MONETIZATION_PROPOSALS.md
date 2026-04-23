# Monetization Proposals (2026-04-23)

Companion document to the **Monetization Readiness Spine Patch**. The
spine patch wires the plumbing (entitlements SSOT, metering, delegation
audit, workspace schema), but deliberately does **not** ship visible
paywalls. This file is where we park additional paid-feature ideas the
product should evaluate in the next few releases, separated into two
groups:

1. **Wired in the spine patch** — the feature key is registered in
   `FEATURE_KEYS`, mapped into `PLAN_FEATURE_MATRIX`, and (when it
   produces a measurable action) a `usage_events` row is already being
   emitted. The rest is purely product/UI work.
2. **Documented only** — ideas where the data shape or schema is not
   ready yet; we defer the matrix/meter wiring until the product
   direction is confirmed.

All proposals assume the 5-plan taxonomy:

- `free`
- `artist_pro`
- `discovery_pro`
- `hybrid_pro` (bundle)
- `gallery_workspace`

`BETA_ALL_PAID=true` remains the global kill-switch until monetization
goes live. When it flips, every proposal below becomes a candidate gate
without further migration work on the core spine.

---

## Group A — Already wired in the spine

| # | Feature key | Meter event(s) | Suggested plan(s) | Rationale |
|---|---|---|---|---|
| 1 | `board.pro_create` | `board.created`, `board.saved_artwork`, `board.saved_exhibition` | `discovery_pro`, `hybrid_pro`, `gallery_workspace` | Boards are the unit of curatorial work. A free limit (e.g. 3 active boards) keeps hobbyists happy while converting gallerists/curators who routinely run 10+ shortlists. |
| 2 | `board.room_analytics` | `board.room_viewed` | `discovery_pro`, `gallery_workspace` | "Who opened my private room?" is an obvious upgrade moment. Already metered at board-room level. |
| 3 | `social.connection_unlimited` | `connection.message_sent` | `hybrid_pro`, `gallery_workspace` | Free users cap at N direct messages/month. Outreach workflows for professional collectors happily pay for unlimited. |
| 4 | `ai.bio_assist`, `ai.inquiry_reply_assist`, `ai.exhibition_copy_assist`, `ai.intro_assist`, `ai.studio_intelligence` | `ai.*.generated` | `artist_pro`, `hybrid_pro`, `gallery_workspace` (last two) | Per-feature monthly quotas let us be generous on popular helpers (bio) and stricter on expensive ones (studio_intelligence). The spine already routes every AI call through `resolveEntitlementFor`. |
| 5 | `insights.profile_viewer_identity` | — (read-side) | `artist_pro`, `hybrid_pro`, `gallery_workspace` | Legacy `VIEW_PROFILE_VIEWERS_LIST`, now canonical. Strongest retention signal for artists. |
| 6 | `insights.board_saver_identity`, `insights.board_public_actor_details` | — | `artist_pro`, `hybrid_pro`, `gallery_workspace` | Already shipping in `/notifications`. Revealing the saver/curator name is the single highest-conversion moment for emerging artists. |
| 7 | `inquiry.triage` | `inquiry.replied` | `artist_pro`, `hybrid_pro`, `gallery_workspace` | Metering turnaround time lets us surface "Pro reply speed" badges and gate pipeline views once volume justifies it. |
| 8 | `delegation.operator_invite`, `delegation.multi_scope` | `delegation.acting_as_entered`, `delegation.acting_as_exited` | `gallery_workspace` (+ `hybrid_pro` capped) | Every acting-as flip now lands in `acting_context_events`; seat-based pricing needs exactly this trail. |

> Group A features can be monetized by flipping `BETA_ALL_PAID=false` and
> writing plan rows; no additional schema work is required.

---

## Group B — Documented only (schema/product follow-up)

| # | Feature key (provisional) | Idea | Schema work required |
|---|---|---|---|
| 9 | `board.custom_branding` | Gallerists can set a logo + palette on shared board rooms. | `shortlist_branding` table, storage prefix. |
| 10 | `board.embed_widget` | Paste a `<script>` to embed a board room on the gallery's own site. | Embed token rotation, CSP whitelisting. |
| 11 | `board.template` | Save a board structure (sections, copy) as a reusable template. | `shortlist_templates` table + copy RPC. |
| 12 | `exhibition.co_curator_credits` | Multi-curator credits with paid seat requirement for co-curator. | Extend `exhibition_credits` with paid-role flag. |
| 13 | `inquiry.response_templates` | Saved reply snippets with variables (artwork title, price). | `inquiry_reply_templates` table. |
| 14 | `inquiry.sla_badge` | Display "Replies within 24h" if 7-day SLA holds; paid feature. | Compute from `usage_events.inquiry.replied` — no new schema. |
| 15 | `discovery.saved_searches` | Persist filter combinations. | `saved_searches` table with `notify_on_match` flag. |
| 16 | `discovery.artwork_alerts` | Email/Push when a new artwork matches a saved search. | Webhook pipeline + user-managed alert preferences (extend `alert_preferences`). |
| 17 | `insights.referrer_source` | Which app/domain brought viewers to your artwork. | Referrer captured via client beacon; new `profile_view_referrers` table. |
| 18 | `insights.interest_breakdown` | Breakdown of viewer roles, geos, device types. | Reuse `profile_views` with a weekly aggregation matview. |
| 19 | `provenance.verified_badge` | Paid verification of provenance records. | Admin workflow + `provenance_verifications` table. |
| 20 | `workspace.bulk_ops` | Bulk import/export of artworks for galleries. | Async job pipeline + per-workspace rate limits. |
| 21 | `profile.custom_slug` | `@gallery-foo` vanity URL. | `profiles.custom_slug text unique`, reserved-names check. |
| 22 | `profile.referrer_analytics` | Traffic source dashboard on `/my`. | Paired with #17 schema. |
| 23 | `gallery_workspace` multi-seat billing | Per-seat billing inside `workspaces`. | Stripe subscription schedule + `workspace_members.seat_status`. |

Feature keys #9–#23 are **not** all in `FEATURE_KEYS`; we register them
only when the product team commits to the shape. This is intentional to
keep the union small and meaningful for the TypeScript resolver.

---

## Decision log

- **2026-04-23** — Wire AI per-feature quotas with the same shape as the
  future paid quotas. Rationale: handles the global soft-cap today and
  migrates to individual billing with zero rollout risk.
- **2026-04-23** — All delegation actions become audit events. Rationale:
  workspace/seat billing will hinge on "actions per seat per month" and
  this is the only durable trail.
- **2026-04-23** — Add `entitlement_decisions` table (sampled logging).
  Rationale: we need _some_ ground truth when customers ask "why was I
  blocked?" without retrofitting instrumentation later.

## Next milestones

1. **Beta → Live**: flip `BETA_ALL_PAID=false`, seed plans per cohort,
   connect Stripe. Spine patch guarantees no code-path changes.
2. **Pricing page**: publish plan matrix (Group A only) with copy from
   marketing. Per-plan quota numbers come from `PLAN_QUOTA_MATRIX`.
3. **Workspace UI**: build the invite / member / billing surfaces on top
   of the `workspaces` tables the spine patch landed.
