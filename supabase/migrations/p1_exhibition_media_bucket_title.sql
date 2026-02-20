-- Add optional custom bucket title for exhibition_media.
-- If set, displayed as section title; otherwise fall back to type (installation / side_event).
-- type 'custom' = user-named bucket; display uses bucket_title.
-- Design: docs/EXHIBITION_PROJECT_AND_MULTI_CLAIM_DESIGN.md (자유 제목 버킷)

alter table public.exhibition_media
  add column if not exists bucket_title text;

comment on column public.exhibition_media.bucket_title is 'Optional custom section title. If null, section uses type label (installation/side_event). For type=custom, this is the section title.';

alter table public.exhibition_media
  drop constraint if exists exhibition_media_type_check;

alter table public.exhibition_media
  add constraint exhibition_media_type_check check (type in ('installation', 'side_event', 'custom'));
