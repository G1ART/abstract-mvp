# QA smoke — Abstract MVP (beta hardening)

Run after deploying or before a beta cut. Supabase: apply `p0_beta_hardening_wave1.sql` (and prior migrations) first.

## Automated (Playwright)

```bash
# Terminal A
npm run dev

# Terminal B
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

Optional auto-start dev server:

```bash
PLAYWRIGHT_START_SERVER=1 npm run test:e2e
```

Current suite is minimal (public shell + login page). Extend `e2e/smoke.spec.ts` with authenticated flows when test credentials are available.

## Manual — quick

1. **Feed — All:** scroll / load more; no duplicate spinners; refresh button works.
2. **Feed — Following:** follows + exhibitions merge; load more if many follows; empty state CTA.
3. **My library:** `/my/library` — filters, search, load more, artwork opens / edit link.
4. **Bulk upload:** title prefix/suffix/replace (with confirm), size, fixed price, exhibition link/unlink, CSV paste → drafts.
5. **Inquiries:** `/my/inquiries` — filter, search, thread, reply, status; unread styling; load more.
6. **Notifications:** opening list does **not** auto-mark all read; per-row read on click; “Mark all as read” works.
7. **Diagnostics:** `/my/diagnostics` in dev or with `NEXT_PUBLIC_DIAGNOSTICS=1` — events list loads after using the app.

## Trust & Simplicity checks

1. **Feed infinite scroll (All):** scroll to bottom → more items load → no duplicates → "You're all caught up" at end.
2. **Feed infinite scroll (Following):** same behavior for Following tab.
3. **External artist on exhibition:** create exhibition with non-onboarded external artist → `/e/[id]` shows external artist name, not "Artist" or blank.
4. **External artist on artwork detail:** artwork with external artist → `/artwork/[id]` shows correct name in provenance.
5. **Save modal:** `/artwork/[id]` → "Save" → modal title is just "Save", list shows existing shortlists, can create new.
6. **Room simplicity:** `/room/[token]` → no "Private viewing room" banner, just title + "by" credit + artwork cards.
7. **Alerts simplicity:** `/my/alerts` → title is "Alerts", digest section says "coming soon", no pending events shown unless there are some (collapsed).
8. **Ops hidden:** `/my` dashboard has no "Ops Panel" link. `/my/ops` still works via URL and shows "(internal)".
9. **Import template:** `/my/library/import` → "Download template CSV" works, field names show human-readable labels, required fields have red asterisk.
10. **Import duplicate skip:** import CSV with duplicates → duplicates flagged → "Skip duplicates" checked by default → summary shows skipped count.

## Wave 2.1 integration checks

1. **Shortlist from artwork:** `/artwork/[id]` → "Save" → choose/create shortlist → saved; repeat → toggled off.
2. **Shortlist from exhibition:** `/e/[id]` → "Save" → add exhibition to shortlist.
3. **Collaborator add:** `/my/shortlists/[id]` → search username → add as viewer → appears in list with badge.
4. **Collaborator remove:** remove collaborator → gone from list.
5. **Rotate link:** click "Rotate link" → old `/room/` link fails → new link works.
6. **Room disable:** toggle "Room: Disabled" → `/room/[token]` shows expired message.
7. **Room CTA:** `/room/[token]` → "Ask about this work" → navigates to `/artwork/[id]?fromRoom=...`.
8. **Room breadcrumb:** artwork detail from room → "← Back to room" visible.
9. **Interest notification:** add "Oil" medium interest → upload artwork with medium "Oil on canvas" → notification generated with interest source.
10. **Digest queue:** after notification → `/my/alerts` → digest preview shows event.
11. **Assignee:** `/my/inquiries` → "Assign to me" → "assigned" badge visible.
12. **Last contact auto:** reply to inquiry → `last_contact_date` updated automatically.
13. **Notes RLS:** inquiry note visible to artwork artist, not just author (test with acting-as).
14. **Import v2:** paste CSV with 10+ columns → auto-map → preview with duplicate flags → skip duplicates → import summary.
15. **Ops export:** `/my/ops` → "Export CSV" → file downloads. Profile link copy works. Recent 7d filter works.

## Wave 2 differentiation checks

1. **Shortlists:** create shortlist, add artwork, copy share link → open `/room/{token}` in incognito → items visible.
2. **Shortlist detail:** edit title/description, remove item, see collaborator count.
3. **Pipeline:** `/my/inquiries` → change pipeline stage → filter by stage → verify.
4. **Internal notes:** expand inquiry → add note → note appears; note NOT visible to inquirer.
5. **Next action date:** set date, verify it persists after page reload.
6. **CSV import:** `/my/library/import` → paste CSV → map columns → validate → import → check drafts in library.
7. **CSV export:** `/my/library` → click Export CSV → file downloads with correct data.
8. **Alerts:** `/my/alerts` → toggle new work alerts → change digest → add/remove interest.
9. **Ops panel:** `/my/ops` → see profile table → filter by random username → filter by no uploads.
10. **New work trigger:** follow an artist → artist uploads public work → follower gets notification (requires alert_preferences row with `new_work_alerts = true`).

## Wave 1.1 reconciliation checks

1. **Feed following tab:** load more triggers IntersectionObserver; no scroll listener present.
2. **Feed TTL:** switch tabs, then return within 90s — no network fetch; after 90s — background refresh fires.
3. **Feed events:** check `beta_analytics_events` for `feed_loaded` with `source`, `item_count`, `duration_ms`.
4. **Artwork detail — inquirer thread:** send inquiry, receive reply, send follow-up — all messages visible in thread.
5. **Artwork detail — artist thread:** artist sees thread messages per inquiry; can reply multiple times (not one-shot).
6. **Notifications:** entering `/notifications` does NOT auto-clear unread; click single → only that row read; button clears all.

## Regression

- Profile save / settings unchanged.
- Artwork detail price inquiry still creates thread row when message non-empty.
- Feed `getFollowingIds` called once per tab branch; `listFollowingArtworks` receives pre-fetched IDs.
