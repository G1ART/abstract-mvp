-- P1-0 Profile Identity Surface — additive columns
--
-- These five columns let a profile carry a richer public identity:
--   * cover/hero image with simple vertical reposition,
--   * a long-form artist statement with optional hero image,
--   * an updated_at marker so the UI can show "last edited" if useful.
--
-- All columns are nullable / safely defaulted so existing rows keep working
-- without backfill, and so save paths (upsert_my_profile, saveProfileUnified)
-- can roll forward incrementally.

alter table public.profiles
  add column if not exists cover_image_url text,
  add column if not exists cover_image_position_y numeric default 50,
  add column if not exists artist_statement text,
  add column if not exists artist_statement_hero_image_url text,
  add column if not exists artist_statement_updated_at timestamptz;

comment on column public.profiles.cover_image_url is
  'Storage path (artworks bucket, {userId}/profile/cover/...) for the public profile cover/hero image. Nullable.';

comment on column public.profiles.cover_image_position_y is
  'Vertical focal point for cover_image_url (0=top, 50=center, 100=bottom). Used as object-position-y on the rendered cover band.';

comment on column public.profiles.artist_statement is
  'Long-form artist statement, public when profile is public. Plain text with paragraph breaks; UI renders with read-more collapse if long.';

comment on column public.profiles.artist_statement_hero_image_url is
  'Optional storage path for an image rendered above the artist statement section. Nullable.';

comment on column public.profiles.artist_statement_updated_at is
  'Stamped by upsert_my_profile when artist_statement is changed. Used for "last edited" UI affordances and cache busting.';

-- Lightweight check: keep the reposition value in 0–100. Permissive bounds
-- so earlier rows that stored 50 by default keep validating.
alter table public.profiles
  drop constraint if exists profiles_cover_image_position_y_chk;
alter table public.profiles
  add constraint profiles_cover_image_position_y_chk
  check (cover_image_position_y is null or (cover_image_position_y >= 0 and cover_image_position_y <= 100));
