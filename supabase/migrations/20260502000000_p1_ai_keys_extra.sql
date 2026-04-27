-- P1 AI workflow assistants — Exhibition Review + Delegation Brief feature key seed.
--
-- Pairs with `20260501000000_p1_ai_feature_keys.sql` (Board Pitch Pack).
-- Seeds the two remaining AI feature keys open across every plan so we
-- don't render visible paywalls during the beta. Quotas can be added
-- later via `plan_quota_matrix` without code changes.
--
-- Idempotent: every (plan, feature) row is upserted via
-- `on conflict do nothing`. We do NOT truncate `plan_feature_matrix`
-- here; the canonical truncate-and-reseed lives in
-- `20260423123000_seed_plan_matrix.sql`. This file is purely additive.

begin;

insert into public.plan_feature_matrix (plan_key, feature_key) values
  ('free',              'ai.exhibition_review'),
  ('artist_pro',        'ai.exhibition_review'),
  ('discovery_pro',     'ai.exhibition_review'),
  ('hybrid_pro',        'ai.exhibition_review'),
  ('gallery_workspace', 'ai.exhibition_review'),
  ('free',              'ai.delegation_brief'),
  ('artist_pro',        'ai.delegation_brief'),
  ('discovery_pro',     'ai.delegation_brief'),
  ('hybrid_pro',        'ai.delegation_brief'),
  ('gallery_workspace', 'ai.delegation_brief')
on conflict (plan_key, feature_key) do nothing;

commit;
