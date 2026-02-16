-- P0: Backfill existing profiles rows with null username (ensures username never null).
-- Run once; safe to re-run (only updates where username is null).
-- Pattern: user_ + first 12 hex chars of id (no dashes) for uniqueness.

update public.profiles
set username = 'user_' || left(replace(id::text, '-', ''), 12)
where username is null;
