-- P0: Drop NOT NULL on profiles.education (jsonb) to unblock save when education is empty.
-- Root cause: 23502 "education violates not-null constraint" when payload included education:null.

alter table public.profiles
  alter column education drop not null;
