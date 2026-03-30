-- =============================================================
-- Wave 2: Beta Differentiation
-- Covers: Shortlists/Rooms (A), Pipeline (B), Alerts (D), Ops helpers
-- Idempotent: safe to re-run.
-- =============================================================

-- ─── Scope B: Sales Pipeline ─────────────────────────────────

DO $$ BEGIN
  CREATE TYPE pipeline_stage AS ENUM (
    'new','contacted','in_discussion','offer_sent','closed_won','closed_lost'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE price_inquiries
  ADD COLUMN IF NOT EXISTS pipeline_stage pipeline_stage DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS next_action_date date,
  ADD COLUMN IF NOT EXISTS last_contact_date timestamptz;

CREATE INDEX IF NOT EXISTS idx_price_inquiries_pipeline
  ON price_inquiries (pipeline_stage, last_message_at DESC NULLS LAST);

-- Internal notes (private to gallery/artist side)
CREATE TABLE IF NOT EXISTS inquiry_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES price_inquiries(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inquiry_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "inquiry_notes_select" ON inquiry_notes FOR SELECT
    USING (author_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "inquiry_notes_insert" ON inquiry_notes FOR INSERT
    WITH CHECK (author_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "inquiry_notes_delete" ON inquiry_notes FOR DELETE
    USING (author_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC: update pipeline fields
CREATE OR REPLACE FUNCTION update_inquiry_pipeline(
  p_inquiry_id uuid,
  p_pipeline_stage text DEFAULT NULL,
  p_assignee_id uuid DEFAULT NULL,
  p_next_action_date date DEFAULT NULL,
  p_last_contact_date timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_artist_id uuid;
BEGIN
  SELECT a.artist_id INTO v_artist_id
    FROM price_inquiries pi
    JOIN artworks a ON a.id = pi.artwork_id
   WHERE pi.id = p_inquiry_id;

  IF v_artist_id IS NULL OR v_artist_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE price_inquiries SET
    pipeline_stage   = COALESCE(p_pipeline_stage::pipeline_stage, pipeline_stage),
    assignee_id      = COALESCE(p_assignee_id, assignee_id),
    next_action_date = COALESCE(p_next_action_date, next_action_date),
    last_contact_date= COALESCE(p_last_contact_date, last_contact_date)
  WHERE id = p_inquiry_id;
END;
$$;

-- ─── Scope A: Shortlists / Private Rooms ─────────────────────

CREATE TABLE IF NOT EXISTS shortlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL DEFAULT 'Untitled',
  description text,
  is_private boolean NOT NULL DEFAULT true,
  share_token uuid UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shortlists_owner ON shortlists (owner_id, updated_at DESC);

ALTER TABLE shortlists ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "shortlists_owner_all" ON shortlists FOR ALL
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Items (artwork or exhibition reference)
CREATE TABLE IF NOT EXISTS shortlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_id uuid NOT NULL REFERENCES shortlists(id) ON DELETE CASCADE,
  artwork_id uuid REFERENCES artworks(id) ON DELETE CASCADE,
  exhibition_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  note text,
  "position" int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_shortlist_item_type CHECK (
    num_nonnulls(artwork_id, exhibition_id) = 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shortlist_artwork
  ON shortlist_items (shortlist_id, artwork_id) WHERE artwork_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_shortlist_exhibition
  ON shortlist_items (shortlist_id, exhibition_id) WHERE exhibition_id IS NOT NULL;

ALTER TABLE shortlist_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "shortlist_items_owner" ON shortlist_items FOR ALL
    USING (EXISTS (SELECT 1 FROM shortlists s WHERE s.id = shortlist_id AND s.owner_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM shortlists s WHERE s.id = shortlist_id AND s.owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Collaborators
CREATE TABLE IF NOT EXISTS shortlist_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_id uuid NOT NULL REFERENCES shortlists(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shortlist_id, profile_id)
);

ALTER TABLE shortlist_collaborators ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "shortlist_collab_owner_manage" ON shortlist_collaborators FOR ALL
    USING (EXISTS (SELECT 1 FROM shortlists s WHERE s.id = shortlist_id AND s.owner_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM shortlists s WHERE s.id = shortlist_id AND s.owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "shortlist_collab_self_select" ON shortlist_collaborators FOR SELECT
    USING (profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Collaborator can SELECT shortlist + items
DO $$ BEGIN
  CREATE POLICY "shortlists_collab_select" ON shortlists FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM shortlist_collaborators sc
       WHERE sc.shortlist_id = id AND sc.profile_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "shortlist_items_collab_select" ON shortlist_items FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM shortlist_collaborators sc
       WHERE sc.shortlist_id = shortlist_items.shortlist_id AND sc.profile_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Editor collaborator can insert/update/delete items
DO $$ BEGIN
  CREATE POLICY "shortlist_items_collab_editor" ON shortlist_items FOR ALL
    USING (EXISTS (
      SELECT 1 FROM shortlist_collaborators sc
       WHERE sc.shortlist_id = shortlist_items.shortlist_id
         AND sc.profile_id = auth.uid()
         AND sc.role = 'editor'
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM shortlist_collaborators sc
       WHERE sc.shortlist_id = shortlist_items.shortlist_id
         AND sc.profile_id = auth.uid()
         AND sc.role = 'editor'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Room view analytics
CREATE TABLE IF NOT EXISTS shortlist_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_id uuid NOT NULL REFERENCES shortlists(id) ON DELETE CASCADE,
  viewer_id uuid REFERENCES auth.users(id),
  action text NOT NULL DEFAULT 'viewed' CHECK (action IN ('viewed', 'opened', 'inquiry_clicked')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shortlist_views ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "shortlist_views_insert" ON shortlist_views FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "shortlist_views_owner_select" ON shortlist_views FOR SELECT
    USING (EXISTS (SELECT 1 FROM shortlists s WHERE s.id = shortlist_id AND s.owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC: get shortlist by share_token (public room access)
CREATE OR REPLACE FUNCTION get_shortlist_by_token(p_token uuid)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  owner_id uuid,
  owner_username text,
  owner_display_name text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT s.id, s.title, s.description, s.owner_id,
           p.username, p.display_name
      FROM shortlists s
      JOIN profiles p ON p.id = s.owner_id
     WHERE s.share_token = p_token;
END;
$$;

-- RPC: list shortlist items by token (public room access)
CREATE OR REPLACE FUNCTION get_shortlist_items_by_token(p_token uuid)
RETURNS TABLE(
  item_id uuid,
  artwork_id uuid,
  exhibition_id uuid,
  note text,
  "position" int,
  artwork_title text,
  artwork_image_path text,
  artwork_artist_name text,
  exhibition_title text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_shortlist_id uuid;
BEGIN
  SELECT s.id INTO v_shortlist_id
    FROM shortlists s WHERE s.share_token = p_token;
  IF v_shortlist_id IS NULL THEN RETURN; END IF;

  -- Log view
  INSERT INTO shortlist_views (shortlist_id, viewer_id, action)
    VALUES (v_shortlist_id, auth.uid(), 'viewed');

  RETURN QUERY
    SELECT si.id AS item_id, si.artwork_id, si.exhibition_id, si.note, si."position",
           a.title AS artwork_title,
           (SELECT ai.storage_path FROM artwork_images ai WHERE ai.artwork_id = a.id ORDER BY ai."position" LIMIT 1) AS artwork_image_path,
           prof.display_name AS artwork_artist_name,
           proj.title AS exhibition_title
      FROM shortlist_items si
      LEFT JOIN artworks a ON a.id = si.artwork_id AND a.visibility = 'public'
      LEFT JOIN profiles prof ON prof.id = a.artist_id
      LEFT JOIN projects proj ON proj.id = si.exhibition_id
     WHERE si.shortlist_id = v_shortlist_id
     ORDER BY si."position", si.created_at;
END;
$$;

-- ─── Scope D: Alert preferences ──────────────────────────────

CREATE TABLE IF NOT EXISTS alert_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) UNIQUE,
  digest_frequency text NOT NULL DEFAULT 'off' CHECK (digest_frequency IN ('off', 'daily', 'weekly')),
  new_work_alerts boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE alert_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "alert_preferences_own" ON alert_preferences FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS saved_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  interest_type text NOT NULL CHECK (interest_type IN ('artist', 'medium', 'price_band', 'exhibition')),
  interest_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, interest_type, interest_value)
);

ALTER TABLE saved_interests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "saved_interests_own" ON saved_interests FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Trigger: when a followed artist uploads a new public work, insert notification
CREATE OR REPLACE FUNCTION notify_followers_new_work()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.visibility = 'public' AND NEW.artist_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, actor_id, artwork_id, payload)
    SELECT f.follower_id, 'new_work', NEW.artist_id, NEW.id, '{}'::jsonb
      FROM follows f
      JOIN alert_preferences ap ON ap.user_id = f.follower_id AND ap.new_work_alerts = true
     WHERE f.following_id = NEW.artist_id
       AND f.follower_id != NEW.artist_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_followers_new_work ON artworks;
CREATE TRIGGER trg_notify_followers_new_work
  AFTER INSERT ON artworks
  FOR EACH ROW EXECUTE FUNCTION notify_followers_new_work();

-- Add new_work to notification type if missing
DO $$ BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- ─── Scope E: Ops helpers (read-only RPCs) ───────────────────

CREATE OR REPLACE FUNCTION ops_onboarding_summary()
RETURNS TABLE(
  profile_id uuid,
  username text,
  display_name text,
  email text,
  has_random_username boolean,
  artwork_count bigint,
  created_at timestamptz,
  delegation_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT
      p.id AS profile_id,
      p.username,
      p.display_name,
      u.email,
      (p.username ~ '^user_[0-9a-f]{8}$') AS has_random_username,
      (SELECT count(*) FROM artworks a WHERE a.artist_id = p.id) AS artwork_count,
      p.created_at,
      (SELECT count(*) FROM delegations d WHERE d.delegator_profile_id = p.id AND d.status = 'active') AS delegation_count
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    ORDER BY p.created_at DESC;
END;
$$;
