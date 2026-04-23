-- Monetization Spine — seed plans + plan_feature_matrix + plan_quota_matrix.
--
-- Keep in sync with `src/lib/entitlements/planMatrix.ts`. When a matrix row
-- is removed in TS, we leave the DB row in place (the historical decision
-- trail is valuable). When a row is added or updated, the ON CONFLICT
-- clauses overwrite idempotently.
--
-- Runtime use: DB-level gates (e.g. `get_profile_viewers`) may SELECT from
-- these tables so SQL stays in sync with TS without hardcoding plans.

begin;

-- 1) Plans
insert into public.plans (plan_key, display_name, description, seats_default, is_seat_plan)
values
  ('free',              'Free',              'Baseline access for every onboarded user.',                     1, false),
  ('artist_pro',        'Artist Pro',        'Artist-side insights, AI assist without ceiling, operator slot.', 1, false),
  ('discovery_pro',     'Discovery Pro',     'Curator/collector boards, discovery alerts and room analytics.',  1, false),
  ('hybrid_pro',        'Hybrid Pro',        'Artist Pro + Discovery Pro combined for creators who curate.',    1, false),
  ('gallery_workspace', 'Gallery Workspace', 'Organization seats, delegation, bulk ops and workspace billing.', 5, true),
  -- Legacy plan preserved for data backward-compatibility.
  ('collector_pro',     'Collector Pro (legacy)', 'Legacy collector plan; superseded by discovery_pro.',        1, false)
on conflict (plan_key) do update
  set display_name = excluded.display_name,
      description  = excluded.description,
      seats_default = excluded.seats_default,
      is_seat_plan = excluded.is_seat_plan;

-- 2) plan_feature_matrix — rebuild from scratch to mirror TS exactly.
truncate public.plan_feature_matrix;

insert into public.plan_feature_matrix (plan_key, feature_key) values
  -- insights
  ('artist_pro', 'insights.profile_viewer_identity'),
  ('hybrid_pro', 'insights.profile_viewer_identity'),
  ('gallery_workspace', 'insights.profile_viewer_identity'),
  ('artist_pro', 'insights.artwork_viewer_identity'),
  ('hybrid_pro', 'insights.artwork_viewer_identity'),
  ('gallery_workspace', 'insights.artwork_viewer_identity'),
  ('artist_pro', 'insights.board_saver_identity'),
  ('hybrid_pro', 'insights.board_saver_identity'),
  ('gallery_workspace', 'insights.board_saver_identity'),
  ('artist_pro', 'insights.board_public_actor_details'),
  ('hybrid_pro', 'insights.board_public_actor_details'),
  ('gallery_workspace', 'insights.board_public_actor_details'),
  ('artist_pro', 'insights.referrer_source'),
  ('hybrid_pro', 'insights.referrer_source'),
  ('gallery_workspace', 'insights.referrer_source'),
  ('artist_pro', 'insights.interest_breakdown'),
  ('hybrid_pro', 'insights.interest_breakdown'),
  ('gallery_workspace', 'insights.interest_breakdown'),
  -- ai (metered for free)
  ('free', 'ai.bio_assist'),
  ('artist_pro', 'ai.bio_assist'),
  ('discovery_pro', 'ai.bio_assist'),
  ('hybrid_pro', 'ai.bio_assist'),
  ('gallery_workspace', 'ai.bio_assist'),
  ('free', 'ai.inquiry_reply_assist'),
  ('artist_pro', 'ai.inquiry_reply_assist'),
  ('discovery_pro', 'ai.inquiry_reply_assist'),
  ('hybrid_pro', 'ai.inquiry_reply_assist'),
  ('gallery_workspace', 'ai.inquiry_reply_assist'),
  ('free', 'ai.exhibition_copy_assist'),
  ('artist_pro', 'ai.exhibition_copy_assist'),
  ('discovery_pro', 'ai.exhibition_copy_assist'),
  ('hybrid_pro', 'ai.exhibition_copy_assist'),
  ('gallery_workspace', 'ai.exhibition_copy_assist'),
  ('free', 'ai.intro_assist'),
  ('artist_pro', 'ai.intro_assist'),
  ('discovery_pro', 'ai.intro_assist'),
  ('hybrid_pro', 'ai.intro_assist'),
  ('gallery_workspace', 'ai.intro_assist'),
  ('artist_pro', 'ai.studio_intelligence'),
  ('discovery_pro', 'ai.studio_intelligence'),
  ('hybrid_pro', 'ai.studio_intelligence'),
  ('gallery_workspace', 'ai.studio_intelligence'),
  -- boards
  ('free', 'board.pro_create'),
  ('artist_pro', 'board.pro_create'),
  ('discovery_pro', 'board.pro_create'),
  ('hybrid_pro', 'board.pro_create'),
  ('gallery_workspace', 'board.pro_create'),
  ('discovery_pro', 'board.room_analytics'),
  ('hybrid_pro', 'board.room_analytics'),
  ('gallery_workspace', 'board.room_analytics'),
  ('discovery_pro', 'board.custom_branding'),
  ('hybrid_pro', 'board.custom_branding'),
  ('gallery_workspace', 'board.custom_branding'),
  ('discovery_pro', 'board.embed_widget'),
  ('hybrid_pro', 'board.embed_widget'),
  ('gallery_workspace', 'board.embed_widget'),
  ('discovery_pro', 'board.template'),
  ('hybrid_pro', 'board.template'),
  ('gallery_workspace', 'board.template'),
  -- inquiries
  ('artist_pro', 'inquiry.triage'),
  ('hybrid_pro', 'inquiry.triage'),
  ('gallery_workspace', 'inquiry.triage'),
  ('artist_pro', 'inquiry.response_templates'),
  ('hybrid_pro', 'inquiry.response_templates'),
  ('gallery_workspace', 'inquiry.response_templates'),
  ('artist_pro', 'inquiry.sla_badge'),
  ('hybrid_pro', 'inquiry.sla_badge'),
  ('gallery_workspace', 'inquiry.sla_badge'),
  -- discovery
  ('discovery_pro', 'discovery.artwork_alerts'),
  ('hybrid_pro', 'discovery.artwork_alerts'),
  ('gallery_workspace', 'discovery.artwork_alerts'),
  ('discovery_pro', 'discovery.saved_searches'),
  ('hybrid_pro', 'discovery.saved_searches'),
  ('gallery_workspace', 'discovery.saved_searches'),
  -- exhibitions
  ('artist_pro', 'exhibition.co_curator_credits'),
  ('hybrid_pro', 'exhibition.co_curator_credits'),
  ('gallery_workspace', 'exhibition.co_curator_credits'),
  -- social
  ('free', 'social.connection_unlimited'),
  ('artist_pro', 'social.connection_unlimited'),
  ('discovery_pro', 'social.connection_unlimited'),
  ('hybrid_pro', 'social.connection_unlimited'),
  ('gallery_workspace', 'social.connection_unlimited'),
  -- profile
  ('artist_pro', 'profile.custom_slug'),
  ('discovery_pro', 'profile.custom_slug'),
  ('hybrid_pro', 'profile.custom_slug'),
  ('gallery_workspace', 'profile.custom_slug'),
  ('artist_pro', 'profile.referrer_analytics'),
  ('discovery_pro', 'profile.referrer_analytics'),
  ('hybrid_pro', 'profile.referrer_analytics'),
  ('gallery_workspace', 'profile.referrer_analytics'),
  -- provenance
  ('artist_pro', 'provenance.verified_badge'),
  ('hybrid_pro', 'provenance.verified_badge'),
  ('gallery_workspace', 'provenance.verified_badge'),
  -- workspace
  ('gallery_workspace', 'workspace.create'),
  ('gallery_workspace', 'workspace.seat_invite'),
  ('gallery_workspace', 'workspace.bulk_ops'),
  -- delegation
  ('artist_pro', 'delegation.operator_invite'),
  ('hybrid_pro', 'delegation.operator_invite'),
  ('gallery_workspace', 'delegation.operator_invite'),
  ('gallery_workspace', 'delegation.multi_scope');

-- 3) plan_quota_matrix — subset of features that carry ceilings today.
truncate public.plan_quota_matrix;

insert into public.plan_quota_matrix (plan_key, feature_key, quota_limit, quota_window_days, count_event_keys) values
  -- ai.bio_assist
  ('free',              'ai.bio_assist', 8,    30, array['ai.bio_assist.generated']),
  ('artist_pro',        'ai.bio_assist', 200,  30, array['ai.bio_assist.generated']),
  ('discovery_pro',     'ai.bio_assist', 40,   30, array['ai.bio_assist.generated']),
  ('hybrid_pro',        'ai.bio_assist', 200,  30, array['ai.bio_assist.generated']),
  ('gallery_workspace', 'ai.bio_assist', null, 30, array['ai.bio_assist.generated']),
  -- ai.inquiry_reply_assist
  ('free',              'ai.inquiry_reply_assist', 20,   30, array['ai.inquiry_reply_assist.generated']),
  ('artist_pro',        'ai.inquiry_reply_assist', null, 30, array['ai.inquiry_reply_assist.generated']),
  ('discovery_pro',     'ai.inquiry_reply_assist', 60,   30, array['ai.inquiry_reply_assist.generated']),
  ('hybrid_pro',        'ai.inquiry_reply_assist', null, 30, array['ai.inquiry_reply_assist.generated']),
  ('gallery_workspace', 'ai.inquiry_reply_assist', null, 30, array['ai.inquiry_reply_assist.generated']),
  -- ai.exhibition_copy_assist
  ('free',              'ai.exhibition_copy_assist', 10,  30, array['ai.exhibition_copy_assist.generated']),
  ('artist_pro',        'ai.exhibition_copy_assist', 100, 30, array['ai.exhibition_copy_assist.generated']),
  ('discovery_pro',     'ai.exhibition_copy_assist', 30,  30, array['ai.exhibition_copy_assist.generated']),
  ('hybrid_pro',        'ai.exhibition_copy_assist', 100, 30, array['ai.exhibition_copy_assist.generated']),
  ('gallery_workspace', 'ai.exhibition_copy_assist', null, 30, array['ai.exhibition_copy_assist.generated']),
  -- ai.intro_assist
  ('free',              'ai.intro_assist', 15,  30, array['ai.intro_assist.generated']),
  ('artist_pro',        'ai.intro_assist', 150, 30, array['ai.intro_assist.generated']),
  ('discovery_pro',     'ai.intro_assist', 150, 30, array['ai.intro_assist.generated']),
  ('hybrid_pro',        'ai.intro_assist', 300, 30, array['ai.intro_assist.generated']),
  ('gallery_workspace', 'ai.intro_assist', null, 30, array['ai.intro_assist.generated']),
  -- ai.studio_intelligence
  ('artist_pro',        'ai.studio_intelligence', null, 30, array['ai.studio_intelligence.generated']),
  ('discovery_pro',     'ai.studio_intelligence', null, 30, array['ai.studio_intelligence.generated']),
  ('hybrid_pro',        'ai.studio_intelligence', null, 30, array['ai.studio_intelligence.generated']),
  ('gallery_workspace', 'ai.studio_intelligence', null, 30, array['ai.studio_intelligence.generated']),
  -- board.pro_create (lifetime ceiling)
  ('free',              'board.pro_create', 3,   0,  array['board.created']),
  ('artist_pro',        'board.pro_create', 20,  0,  array['board.created']),
  ('discovery_pro',     'board.pro_create', null, 0, array['board.created']),
  ('hybrid_pro',        'board.pro_create', null, 0, array['board.created']),
  ('gallery_workspace', 'board.pro_create', null, 0, array['board.created']),
  -- social.connection_unlimited
  ('free',              'social.connection_unlimited', 5,   30, array['connection.message_sent']),
  ('artist_pro',        'social.connection_unlimited', 100, 30, array['connection.message_sent']),
  ('discovery_pro',     'social.connection_unlimited', 100, 30, array['connection.message_sent']),
  ('hybrid_pro',        'social.connection_unlimited', 300, 30, array['connection.message_sent']),
  ('gallery_workspace', 'social.connection_unlimited', null, 30, array['connection.message_sent']);

commit;
