-- QA 2026-06-26 (Wave 5 #6) — RPC to update profiles.cv_pdf_path.
--
-- The CV PDF is owned by the viewer (auth.uid()) and stored under
-- their owner folder in the `artworks` bucket. The schema column
-- itself was added in 20260626100000; this migration provides the
-- thin, RLS-safe RPC the editor calls after a successful upload (or
-- to clear the path when removing the file).
--
-- We keep this as a dedicated function (rather than letting the
-- editor write directly via supabase-js) so we can:
--   - normalize the trim/null behaviour in one place,
--   - bump `profile_updated_at` consistently with the other CV RPCs,
--   - leave room to add server-side validation later (e.g. confirm
--     the storage object exists / has the expected prefix).
--
-- The storage object itself is governed by the existing
-- `can_manage_artworks_storage_path` policy (Shape 1: owner folder),
-- so no storage RLS changes are required.

begin;

create or replace function public.update_my_cv_pdf_path(
  p_path text default null
) returns void
language plpgsql
security definer
set search_path = public
as $a$
declare
  v_uid uuid := auth.uid();
  v_path text := nullif(btrim(coalesce(p_path, '')), '');
begin
  if v_uid is null then
    raise exception 'unauthorized: auth.uid() is null'
      using errcode = '28000';
  end if;

  -- Soft sanity check: path must live under the owner's folder so
  -- a stolen JWT can't point cv_pdf_path at someone else's bucket
  -- object. Storage RLS already blocks writes outside the folder,
  -- but the profile column is a free-text pointer and we don't
  -- want to advertise arbitrary paths through the public DTO.
  if v_path is not null
     and v_path not like (v_uid::text || '/%') then
    raise exception 'forbidden: cv_pdf_path must live under owner folder'
      using errcode = '42501';
  end if;

  update public.profiles
     set cv_pdf_path = v_path,
         profile_updated_at = now()
   where id = v_uid;
end;
$a$;

revoke all on function public.update_my_cv_pdf_path(text) from public;
grant execute on function public.update_my_cv_pdf_path(text) to authenticated;

commit;
