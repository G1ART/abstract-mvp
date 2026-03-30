-- =============================================================
-- Wave 2.1: Integration — activation, collaboration, conversion
-- Idempotent: safe to re-run.
-- =============================================================

-- ─── Scope B: Share token rotation / room controls ───────────

ALTER TABLE shortlists
  ADD COLUMN IF NOT EXISTS room_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- RPC: rotate share token (invalidates old links)
CREATE OR REPLACE FUNCTION rotate_shortlist_token(p_shortlist_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_new uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM shortlists WHERE id = p_shortlist_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  v_new := gen_random_uuid();
  UPDATE shortlists SET share_token = v_new, updated_at = now() WHERE id = p_shortlist_id;
  RETURN v_new;
END;
$$;

-- Update room RPC to respect room_active + expires_at
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
     WHERE s.share_token = p_token
       AND s.room_active = true
       AND (s.expires_at IS NULL OR s.expires_at > now());
END;
$$;

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
    FROM shortlists s
   WHERE s.share_token = p_token
     AND s.room_active = true
     AND (s.expires_at IS NULL OR s.expires_at > now());
  IF v_shortlist_id IS NULL THEN RETURN; END IF;

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

-- ─── Scope E: inquiry_notes RLS revision ─────────────────────
-- Notes visible to: author, artwork artist, assignee, delegates

DROP POLICY IF EXISTS "inquiry_notes_select" ON inquiry_notes;

DO $$ BEGIN
  CREATE POLICY "inquiry_notes_select_v2" ON inquiry_notes FOR SELECT
    USING (
      author_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM price_inquiries pi
          JOIN artworks a ON a.id = pi.artwork_id
         WHERE pi.id = inquiry_notes.inquiry_id
           AND (
             a.artist_id = auth.uid()
             OR pi.assignee_id = auth.uid()
           )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Notes insertable by: artwork artist, assignee, delegates (not just author)
DROP POLICY IF EXISTS "inquiry_notes_insert" ON inquiry_notes;

DO $$ BEGIN
  CREATE POLICY "inquiry_notes_insert_v2" ON inquiry_notes FOR INSERT
    WITH CHECK (
      author_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM price_inquiries pi
          JOIN artworks a ON a.id = pi.artwork_id
         WHERE pi.id = inquiry_notes.inquiry_id
           AND (
             a.artist_id = auth.uid()
             OR pi.assignee_id = auth.uid()
           )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Scope E: auto-update last_contact_date ──────────────────

CREATE OR REPLACE FUNCTION auto_update_last_contact_date()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF TG_TABLE_NAME = 'price_inquiry_messages' THEN
    UPDATE price_inquiries
       SET last_contact_date = now()
     WHERE id = NEW.inquiry_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_last_contact ON price_inquiry_messages;
CREATE TRIGGER trg_auto_last_contact
  AFTER INSERT ON price_inquiry_messages
  FOR EACH ROW EXECUTE FUNCTION auto_update_last_contact_date();

-- Also on pipeline_stage change to contacted/in_discussion/offer_sent
CREATE OR REPLACE FUNCTION auto_last_contact_on_stage()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage
     AND NEW.pipeline_stage IN ('contacted', 'in_discussion', 'offer_sent') THEN
    NEW.last_contact_date := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_last_contact_stage ON price_inquiries;
CREATE TRIGGER trg_auto_last_contact_stage
  BEFORE UPDATE ON price_inquiries
  FOR EACH ROW EXECUTE FUNCTION auto_last_contact_on_stage();

-- ─── Scope D: Interest-based notification matching ───────────

CREATE OR REPLACE FUNCTION notify_followers_new_work()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.visibility = 'public' AND NEW.artist_id IS NOT NULL THEN
    -- Follow-based alerts
    INSERT INTO notifications (user_id, type, actor_id, artwork_id, payload)
    SELECT f.follower_id, 'new_work', NEW.artist_id, NEW.id,
           jsonb_build_object('source', 'follow')
      FROM follows f
      LEFT JOIN alert_preferences ap ON ap.user_id = f.follower_id
     WHERE f.following_id = NEW.artist_id
       AND f.follower_id != NEW.artist_id
       AND COALESCE(ap.new_work_alerts, true) = true;

    -- Interest-based: artist name match
    INSERT INTO notifications (user_id, type, actor_id, artwork_id, payload)
    SELECT DISTINCT si.user_id, 'new_work', NEW.artist_id, NEW.id,
           jsonb_build_object('source', 'interest', 'interest_type', si.interest_type, 'interest_value', si.interest_value)
      FROM saved_interests si
      JOIN profiles p ON p.id = NEW.artist_id
     WHERE si.interest_type = 'artist'
       AND (p.display_name ILIKE '%' || si.interest_value || '%'
            OR p.username ILIKE '%' || si.interest_value || '%')
       AND si.user_id != NEW.artist_id
       AND NOT EXISTS (
         SELECT 1 FROM follows f
          WHERE f.follower_id = si.user_id AND f.following_id = NEW.artist_id
       );

    -- Interest-based: medium match
    IF NEW.medium IS NOT NULL AND NEW.medium != '' THEN
      INSERT INTO notifications (user_id, type, actor_id, artwork_id, payload)
      SELECT DISTINCT si.user_id, 'new_work', NEW.artist_id, NEW.id,
             jsonb_build_object('source', 'interest', 'interest_type', 'medium', 'interest_value', si.interest_value)
        FROM saved_interests si
       WHERE si.interest_type = 'medium'
         AND NEW.medium ILIKE '%' || si.interest_value || '%'
         AND si.user_id != NEW.artist_id
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
            WHERE n.user_id = si.user_id AND n.artwork_id = NEW.id AND n.type = 'new_work'
         );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── Scope D: Digest queue skeleton ──────────────────────────

CREATE TABLE IF NOT EXISTS digest_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_digest_events_pending
  ON digest_events (user_id, created_at) WHERE sent_at IS NULL;

ALTER TABLE digest_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "digest_events_own" ON digest_events FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Producer: on new_work notification, also queue digest event
CREATE OR REPLACE FUNCTION queue_digest_on_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.type IN ('new_work', 'like', 'follow', 'price_inquiry', 'price_inquiry_reply') THEN
    INSERT INTO digest_events (user_id, event_type, payload)
    VALUES (NEW.user_id, NEW.type, jsonb_build_object(
      'notification_id', NEW.id,
      'actor_id', NEW.actor_id,
      'artwork_id', NEW.artwork_id
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_digest_on_notification ON notifications;
CREATE TRIGGER trg_digest_on_notification
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION queue_digest_on_notification();
