-- Delegation UX Permissions Upgrade (2026-04-27) — feature key seed.
--
-- Pairs with `src/lib/entitlements/featureKeys.ts` and
-- `src/lib/entitlements/planMatrix.ts`. Seeds four new delegation feature
-- keys open across every plan during beta so no visible paywall appears.
-- Quotas (`plan_quota_matrix`) intentionally unset; ceilings can be added
-- later without code changes.
--
-- Idempotent and additive only: each (plan, feature) row uses
-- `on conflict do nothing`. We do NOT truncate `plan_feature_matrix`.

begin;

insert into public.plan_feature_matrix (plan_key, feature_key) values
  ('free',              'delegation.account'),
  ('artist_pro',        'delegation.account'),
  ('discovery_pro',     'delegation.account'),
  ('hybrid_pro',        'delegation.account'),
  ('gallery_workspace', 'delegation.account'),
  ('free',              'delegation.project'),
  ('artist_pro',        'delegation.project'),
  ('discovery_pro',     'delegation.project'),
  ('hybrid_pro',        'delegation.project'),
  ('gallery_workspace', 'delegation.project'),
  ('free',              'delegation.permission_presets'),
  ('artist_pro',        'delegation.permission_presets'),
  ('discovery_pro',     'delegation.permission_presets'),
  ('hybrid_pro',        'delegation.permission_presets'),
  ('gallery_workspace', 'delegation.permission_presets'),
  ('free',              'delegation.activity_log'),
  ('artist_pro',        'delegation.activity_log'),
  ('discovery_pro',     'delegation.activity_log'),
  ('hybrid_pro',        'delegation.activity_log'),
  ('gallery_workspace', 'delegation.activity_log')
on conflict (plan_key, feature_key) do nothing;

commit;
