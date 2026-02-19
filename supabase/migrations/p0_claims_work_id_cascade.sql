-- Fix artwork deletion: claims.work_id should cascade when artwork is deleted.
-- Without CASCADE, deleting an artwork fails if it has claims (foreign key constraint violation).

-- Drop existing foreign key constraint
alter table public.claims drop constraint if exists claims_work_id_fkey;

-- Recreate with ON DELETE CASCADE
alter table public.claims
  add constraint claims_work_id_fkey
  foreign key (work_id)
  references public.artworks(id)
  on delete cascade;
