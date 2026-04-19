-- AI Wave 1 hardening — acceptance loop.
--
-- Wave 1 shipped `ai_events` with owner-select + owner-insert policies, but
-- no UPDATE policy. That made the `accepted` boolean unreachable: routes
-- could only write `null` at insert time. This migration adds an owner-only
-- UPDATE policy so the `/api/ai/accept` route (invoked when a user applies
-- / copies / inserts a draft) can flip `accepted` to true on the user's own
-- row.
--
-- Invariants:
--   - UPDATE is scoped to the owner's rows only (auth.uid() = user_id).
--   - Routes may only set `accepted` — they do not rewrite feature_key,
--     context_size, latency_ms, etc. This is enforced at the API layer
--     (supabase update payload whitelisted). RLS only guarantees ownership.

drop policy if exists ai_events_update_own on public.ai_events;
create policy ai_events_update_own
  on public.ai_events
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on policy ai_events_update_own on public.ai_events is
  'AI Wave 1 hardening: owner flips accepted=true via /api/ai/accept.';
