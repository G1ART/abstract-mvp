-- Website import sessions: garbage-collect rows older than 30 days.
--
-- Rationale: each session can carry many KB of JSONB (candidate list, dHashes,
-- scan_meta, match_rows). After ~30 days the row is no longer useful — the
-- user has either applied or abandoned it, and the candidate URLs may have
-- rotted on the source site. We expose a SECURITY DEFINER cleanup function
-- and schedule it via pg_cron once a day; the schedule block is wrapped in
-- DO so projects without pg_cron continue to migrate cleanly.

create or replace function public.gc_website_import_sessions(retention_days int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := now() - make_interval(days => retention_days);
  deleted int;
begin
  delete from public.website_import_sessions
   where updated_at < cutoff
     and status in ('applied', 'failed', 'cancelled', 'scan_done', 'matched', 'created');
  get diagnostics deleted = row_count;
  return deleted;
end
$$;

comment on function public.gc_website_import_sessions(int) is
  'Delete website_import_sessions rows older than `retention_days` (default 30). Idempotent. Scheduled daily via pg_cron when available.';

revoke all on function public.gc_website_import_sessions(int) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'gc_website_import_sessions_daily') then
      perform cron.unschedule('gc_website_import_sessions_daily');
    end if;
    perform cron.schedule(
      'gc_website_import_sessions_daily',
      '17 4 * * *', -- 04:17 UTC daily, off-peak for KR/US
      $cron$ select public.gc_website_import_sessions(30); $cron$
    );
  end if;
end
$$;
