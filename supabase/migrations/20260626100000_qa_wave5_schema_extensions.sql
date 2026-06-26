-- QA 2026-06-26 — Wave 5 schema extensions.
--
-- Two additive columns. No existing data is rewritten; defaults match
-- the historical implicit behaviour:
--
--   1. artwork_images.view_type (QA #5)
--      A new column to describe which "view" each image of an artwork
--      represents — primary (wall_mounted), detail close-up, angle,
--      in-situ installation shot, or other. Lets the artwork detail
--      page label the image strip without renaming files, and lets
--      the upload UI ask the user once per image.
--      Default = 'wall_mounted' so every existing row counts as the
--      primary canvas shot (the UI behaviour up until now).
--
--   2. profiles.cv_pdf_path (QA #6)
--      Storage path for an uploaded CV PDF, so artists can offer a
--      downloadable resume in addition to the structured CV editor
--      we already ship. Storage lives in the existing `artworks`
--      bucket under `{userId}/profile/cv/{uuid}.pdf` — that path
--      already passes `can_manage_artworks_storage_path` Shape 1
--      (owner folder), so no storage policy changes are required.
--
-- Both columns are nullable / default-valued; deploying this migration
-- before the UI ships is safe.

begin;

-- == SECTION 1 == artwork_images.view_type
alter table public.artwork_images
  add column if not exists view_type text not null default 'wall_mounted';

-- Restrict to a small whitelist so future surfaces can rely on the
-- vocabulary. `other` is the escape hatch for unanticipated needs.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'artwork_images_view_type_check'
       and conrelid = 'public.artwork_images'::regclass
  ) then
    alter table public.artwork_images
      add constraint artwork_images_view_type_check
      check (view_type in ('wall_mounted', 'detail', 'angle', 'in_situ', 'other'));
  end if;
end $$;

-- == SECTION 2 == profiles.cv_pdf_path
alter table public.profiles
  add column if not exists cv_pdf_path text;

comment on column public.profiles.cv_pdf_path is
  'QA 2026-06-26 (#6): optional Supabase storage path (artworks bucket) of an uploaded CV PDF. Path scheme: {userId}/profile/cv/{uuid}.pdf so the existing owner-folder storage RLS applies unchanged.';

commit;
