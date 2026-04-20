-- AI Wave 2 — observability rollup view.
--
-- Wave 2 adds a `/dev/ai-metrics` page gated to internal accounts. The page
-- needs a pre-rolled summary of the most recent AI events so the dashboard
-- can render without touching the whole `ai_events` table from the client.
--
-- The view is intentionally scoped per-caller via `auth.uid()` + RLS on the
-- underlying table: non-owners see only their own rows when selecting from
-- the view, which matches the owner-select policy on `ai_events`.
--
-- Columns chosen for the metrics page:
--   - feature_key
--   - total events (any state)
--   - degraded events (error_code is not null)
--   - accepted events (accepted = true)
--   - avg / p95 latency_ms (nullable when no rows)
--   - events in last 7 days
--
-- Soft-cap and parse errors remain on the raw table for deeper debugging.

drop view if exists public.v_ai_events_summary;

create view public.v_ai_events_summary
with (security_invoker = true)
as
select
  user_id,
  feature_key,
  count(*)::bigint as events_total,
  count(*) filter (where error_code is not null)::bigint as events_degraded,
  count(*) filter (where accepted is true)::bigint as events_accepted,
  count(*) filter (where created_at > now() - interval '7 days')::bigint as events_7d,
  avg(latency_ms)::numeric(10, 2) as avg_latency_ms,
  (percentile_cont(0.95) within group (order by latency_ms))::numeric(10, 2) as p95_latency_ms,
  max(created_at) as last_event_at
from public.ai_events
group by user_id, feature_key;

comment on view public.v_ai_events_summary is
  'AI Wave 2: per-user per-feature rollup used by /dev/ai-metrics.';
