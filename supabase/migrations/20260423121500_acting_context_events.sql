-- Monetization Spine — acting_context_events: delegation audit log.
--
-- Every write performed *while acting as another profile* writes a row here
-- so we retain a faithful audit trail. The principal (delegator) needs this
-- for compliance, and the product needs it to compute "how much of your
-- workshop was touched by your operator this month" — a direct input for
-- the Gallery Workspace billing model.
--
-- RLS:
--   INSERT: the acting user writes their own rows.
--   SELECT: both actor and principal can read (principal uses the
--           `is_account_delegate_of` helper in reverse: they can read every
--           row whose subject_profile_id belongs to them via their profile).
--   UPDATE/DELETE: disallowed (append-only).

begin;

create table if not exists public.acting_context_events (
  id bigserial primary key,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  subject_profile_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  resource_type text null,
  resource_id uuid null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists acting_context_events_actor_idx
  on public.acting_context_events (actor_user_id, created_at desc);
create index if not exists acting_context_events_subject_idx
  on public.acting_context_events (subject_profile_id, created_at desc);
create index if not exists acting_context_events_action_idx
  on public.acting_context_events (action, created_at desc);

alter table public.acting_context_events enable row level security;

drop policy if exists acting_context_insert_actor on public.acting_context_events;
create policy acting_context_insert_actor
  on public.acting_context_events
  for insert
  with check (auth.uid() = actor_user_id);

drop policy if exists acting_context_select_actor on public.acting_context_events;
create policy acting_context_select_actor
  on public.acting_context_events
  for select
  using (
    auth.uid() = actor_user_id
    or exists (
      select 1 from public.profiles p
       where p.id = subject_profile_id and p.id = auth.uid()
    )
  );

grant select, insert on public.acting_context_events to authenticated;
grant usage, select on sequence public.acting_context_events_id_seq to authenticated;

comment on table public.acting_context_events is
  'Append-only audit log of mutations performed while acting-as another profile. Visible to both actor and principal.';

commit;
