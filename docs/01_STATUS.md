# Abstract MVP — Current Status

## Current production
- URL: https://abstract-mvp-5vik.vercel.app
- Release line: v1.9.x (likes/popular + auth hardening + settings + directory)

## What works (verified)
- Auth: email magic link login + onboarding profile provision
- Password: /set-password flow (post-login enforced via localStorage flag)
- Feed:
  - All / Following tabs
  - Latest / Popular sort (client sort by likes_count, tie-break by created_at)
- Profiles:
  - /u/[username] public profile page
  - Private profile handling with RLS-safe RPC lookup_profile_by_username
- Follows:
  - Follow/Unfollow UX (desktop hover + confirm, mobile tap confirm)
  - Following feed shows followed artists’ public artworks
- Artworks:
  - Upload (image → storage → artwork record → artwork_images attach)
  - Detail page (/artwork/[id]) view, like
  - ownership_status always shown
  - pricing_mode fixed/inquire + public/hidden display
- Artists directory:
  - /artists list + search + follow CTA
- Me dashboard:
  - /me KPIs: artworksCount / followersCount / viewsCount
- Settings:
  - /settings update profile fields, roles, main_role, is_public toggle

## Known issues / risks
- Password enforcement uses localStorage “has_password” (not DB-backed). Clearing storage may re-trigger /set-password.
- Email rate limits in Supabase can block password recovery/testing bursts (needs SMTP provider for scale).
- Popular sort is client-side (not DB ranking). Good enough for MVP; will need server-side ranking later.
- Bulk upload/import not implemented; single-upload flow increases artist onboarding friction.

## Next 24–72h goal
- Run private beta with ~20 trusted testers.
- Collect friction metrics: time-to-first-upload, upload completion rate, field-level pain points.
- Prioritize bulk upload + presets as P0 improvement.

## Immediate next backlog (P0)
1) Bulk upload (multi-image) → create drafts + common defaults
2) Batch edit (apply same year/medium/ownership/pricing to selected works)
3) Draft vs public publishing flow (visibility toggle & “complete required fields” helper)

## Ops checklist (each day)
- Verify deploy is healthy (feed loads, upload works, like works)
- Monitor Supabase auth rate limits + logs during tester onboarding
- Update Top 5 issues in this file
