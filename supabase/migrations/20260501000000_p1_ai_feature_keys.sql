-- P1 AI workflow assistant — Board Pitch Pack feature key seed.
--
-- Seeds the new `ai.board_pitch_pack` feature key open across every plan
-- so we don't render visible paywalls during the beta. Quotas can be
-- added later via `plan_quota_matrix` without code changes.
--
-- This migration is idempotent: every (plan, feature) row is upserted
-- via on conflict do nothing. We intentionally do NOT truncate
-- `plan_feature_matrix` here; the canonical truncate-and-reseed lives in
-- `20260423123000_seed_plan_matrix.sql`. This file is purely additive.

begin;

insert into public.plan_feature_matrix (plan_key, feature_key) values
  ('free',              'ai.board_pitch_pack'),
  ('artist_pro',        'ai.board_pitch_pack'),
  ('discovery_pro',     'ai.board_pitch_pack'),
  ('hybrid_pro',        'ai.board_pitch_pack'),
  ('gallery_workspace', 'ai.board_pitch_pack')
on conflict (plan_key, feature_key) do nothing;

commit;
