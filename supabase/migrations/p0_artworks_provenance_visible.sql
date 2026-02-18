-- Per-artwork setting: show provenance (curated by, collected by, etc.) publicly or only to network.
-- Default true = public. When false, only artist + claim participants can see provenance.

alter table public.artworks
  add column if not exists provenance_visible boolean not null default true;

comment on column public.artworks.provenance_visible is
  'When true, provenance (curator, collector, etc.) is shown publicly. When false, only the artist and users with a claim on this work can see it.';
