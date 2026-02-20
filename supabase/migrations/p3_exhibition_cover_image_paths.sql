-- Representative thumbnail stack for exhibition posts.
-- Curator/host can choose up to a few image paths to display on cards/feed/profile.

alter table public.projects
  add column if not exists cover_image_paths text[] default '{}'::text[];

comment on column public.projects.cover_image_paths is 'Representative image stack paths for exhibition cards/feed.';
