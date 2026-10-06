ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS related_entity_id UUID,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

UPDATE public.notifications
SET read_at = created_at
WHERE is_read = TRUE
  AND read_at IS NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check,
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'message',
      'order',
      'payment',
      'delivery',
      'review',
      'trust_safety',
      'order_status',
      'favorite_price_drop',
      'system'
    )),
  ADD CONSTRAINT notifications_related_entity_type_check
    CHECK (
      related_entity_type IS NULL
      OR related_entity_type IN (
        'user',
        'listing',
        'conversation',
        'message',
        'order',
        'payment',
        'review',
        'report'
      )
    ),
  ADD CONSTRAINT notifications_related_entity_pair_check
    CHECK ((related_entity_type IS NULL) = (related_entity_id IS NULL)),
  ADD CONSTRAINT notifications_read_at_consistency_check
    CHECK (
      (is_read AND read_at IS NOT NULL)
      OR (NOT is_read AND read_at IS NULL)
    );

CREATE INDEX IF NOT EXISTS notifications_recipient_created_at_idx
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_created_at_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE is_read = FALSE;

CREATE OR REPLACE FUNCTION public.protect_notification_read_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() = 'authenticated' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.message IS DISTINCT FROM OLD.message
    OR NEW.link_url IS DISTINCT FROM OLD.link_url
    OR NEW.related_entity_type IS DISTINCT FROM OLD.related_entity_type
    OR NEW.related_entity_id IS DISTINCT FROM OLD.related_entity_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'notification content is immutable'
      USING ERRCODE = '42501';
  END IF;

  NEW.read_at := CASE
    WHEN NEW.is_read THEN COALESCE(OLD.read_at, CURRENT_TIMESTAMP)
    ELSE NULL
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_notifications_protect_read_state ON public.notifications;
CREATE TRIGGER tr_notifications_protect_read_state
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.protect_notification_read_state();

REVOKE ALL PRIVILEGES ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notifications TO authenticated;
GRANT UPDATE (is_read) ON TABLE public.notifications TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.notifications TO service_role;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Recipients can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Recipients can update own notification read state" ON public.notifications;

CREATE POLICY "Recipients can read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Recipients can update own notification read state"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON FUNCTION public.protect_notification_read_state()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_notification_read_state()
  TO service_role;
