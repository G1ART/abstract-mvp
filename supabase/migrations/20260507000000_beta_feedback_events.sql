-- Beta feedback capture (page-level + AI-output micro-feedback).
--
-- Idempotent. Adds a small append-only event table for contextual beta
-- feedback. Distinct from `beta_analytics_events` (which is generic
-- usage telemetry) so that admin queries on user-volunteered feedback
-- stay clean and easy to throttle/redact.
--
-- Design intent:
--  - One row per feedback submission. No updates, no deletes (treat as
--    audit trail; if a row needs to be hidden, use a soft moderation
--    flag layered on top later).
--  - Sentiment is constrained to a small enum so analytics are stable.
--  - `page_key` is a free-form string (e.g. `studio.main`, `bulk_upload`,
--    `board_detail`, `exhibition_detail`, `delegation_hub`, or AI-output
--    keys like `ai.board_pitch_pack`). We do not enforce a CHECK on it
--    so future surfaces can ship without a schema change.
--  - `context_id` is nullable: page-level prompts have no specific
--    target, AI-output chips reference an `ai_event_id`/board/exhibition.
--  - RLS: authenticated users can INSERT their own row. SELECT is
--    deliberately admin-only via service role; a user does not need to
--    read back their feedback in-app.

create table if not exists public.beta_feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  profile_id uuid null references public.profiles(id) on delete set null,
  page_key text not null,
  context_type text null,
  context_id text null,
  sentiment text not null check (
    sentiment in ('useful', 'confusing', 'blocked', 'issue', 'not_now')
  ),
  message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists beta_feedback_events_page_key_created_at_idx
  on public.beta_feedback_events (page_key, created_at desc);

create index if not exists beta_feedback_events_user_id_created_at_idx
  on public.beta_feedback_events (user_id, created_at desc);

alter table public.beta_feedback_events enable row level security;

-- INSERT: an authenticated user may insert a row when:
--   - user_id matches auth.uid() OR is null (anon-but-authenticated edge),
--   - profile_id, when set, points at a profile owned by the same user
--     (matches `profiles.id = auth.uid()` ownership convention used
--     elsewhere in this project).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'beta_feedback_events'
      and policyname = 'beta_feedback_insert_own'
  ) then
    create policy beta_feedback_insert_own
      on public.beta_feedback_events
      for insert
      to authenticated
      with check (
        (user_id is null or user_id = auth.uid())
        and (
          profile_id is null
          or profile_id = auth.uid()
        )
      );
  end if;
end $$;

-- SELECT: no public read. Admin/service role only (default-deny RLS).
-- Intentionally not creating a SELECT policy.

comment on table public.beta_feedback_events is
  'Contextual beta feedback (page-level + AI-output). Append-only. RLS: authenticated users may insert their own rows; reads are restricted to service role.';
