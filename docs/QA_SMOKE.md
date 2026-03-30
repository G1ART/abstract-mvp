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
