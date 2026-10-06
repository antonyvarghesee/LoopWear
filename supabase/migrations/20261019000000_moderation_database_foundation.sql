ALTER TABLE public.reports
  ADD COLUMN resolution_note TEXT,
  ADD CONSTRAINT reports_resolution_note_length_check
    CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 2000),
  ADD CONSTRAINT reports_resolution_note_status_check
    CHECK (resolution_note IS NULL OR status IN ('resolved', 'dismissed'));

CREATE TABLE public.listing_moderation (
  listing_id UUID PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
  moderation_state TEXT NOT NULL
    CHECK (moderation_state IN ('clear', 'hidden')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.user_moderation (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  moderation_state TEXT NOT NULL
    CHECK (moderation_state IN ('normal', 'suspended')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.moderation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  subject_type TEXT NOT NULL
    CHECK (subject_type IN ('report', 'listing', 'user')),
  subject_id UUID NOT NULL,
  action TEXT NOT NULL,
  note TEXT,
  report_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT moderation_events_note_length_check
    CHECK (note IS NULL OR char_length(note) <= 2000),
  CONSTRAINT moderation_events_action_subject_check CHECK (
    (subject_type = 'report'
      AND action IN ('report_reviewed', 'report_resolved', 'report_dismissed')
      AND report_id = subject_id)
    OR (subject_type = 'listing'
      AND report_id IS NULL
      AND action IN ('listing_hidden', 'listing_restored'))
    OR (subject_type = 'user'
      AND report_id IS NULL
      AND action IN ('user_suspended', 'user_reinstated'))
  )
);

ALTER TABLE public.listing_moderation OWNER TO postgres;
ALTER TABLE public.user_moderation OWNER TO postgres;
ALTER TABLE public.moderation_events OWNER TO postgres;

ALTER TABLE public.listing_moderation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_moderation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.listing_moderation
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.user_moderation
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.moderation_events
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.listing_moderation TO authenticated;
GRANT SELECT ON TABLE public.user_moderation TO authenticated;
GRANT SELECT ON TABLE public.moderation_events TO authenticated;

CREATE POLICY "Admins can read listing moderation state"
  ON public.listing_moderation FOR SELECT TO authenticated
  USING (public.has_admin_role());
CREATE POLICY "Admins can read user moderation state"
  ON public.user_moderation FOR SELECT TO authenticated
  USING (public.has_admin_role());
CREATE POLICY "Admins can read moderation events"
  ON public.moderation_events FOR SELECT TO authenticated
  USING (public.has_admin_role());

CREATE INDEX moderation_events_subject_created_at_idx
  ON public.moderation_events (subject_type, subject_id, created_at DESC);
CREATE INDEX moderation_events_actor_created_at_idx
  ON public.moderation_events (actor_id, created_at DESC);
CREATE INDEX moderation_events_report_created_at_idx
  ON public.moderation_events (report_id, created_at DESC)
  WHERE report_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reject_moderation_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'moderation events are append-only'
    USING ERRCODE = '42501';
END;
$$;

ALTER FUNCTION public.reject_moderation_event_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reject_moderation_event_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_moderation_events_append_only
  BEFORE UPDATE OR DELETE ON public.moderation_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_moderation_event_mutation();
CREATE TRIGGER tr_moderation_events_reject_truncate
  BEFORE TRUNCATE ON public.moderation_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_moderation_event_mutation();

CREATE OR REPLACE FUNCTION public.record_moderation_event(
  p_subject_type TEXT,
  p_subject_id UUID,
  p_action TEXT,
  p_note TEXT,
  p_report_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  actor_id UUID := auth.uid();
BEGIN
  IF actor_id IS NULL OR NOT public.has_admin_role() THEN
    RAISE EXCEPTION 'admin authorization required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.moderation_events (
    actor_id, subject_type, subject_id, action, note, report_id
  )
  VALUES (
    actor_id, p_subject_type, p_subject_id, p_action, p_note, p_report_id
  );
END;
$$;

ALTER FUNCTION public.record_moderation_event(TEXT, UUID, TEXT, TEXT, UUID)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_moderation_event(TEXT, UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_listing_moderation_state(
  p_listing_id UUID,
  p_moderation_state TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $$
DECLARE
  actor_id UUID := auth.uid();
  previous_state TEXT;
  event_action TEXT;
  normalized_note TEXT := NULLIF(BTRIM(p_note), '');
BEGIN
  IF actor_id IS NULL OR NOT public.has_admin_role() THEN
    RAISE EXCEPTION 'admin authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_moderation_state IS NULL
    OR p_moderation_state NOT IN ('clear', 'hidden')
    OR char_length(COALESCE(normalized_note, '')) > 2000
  THEN
    RAISE EXCEPTION 'invalid listing moderation input' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing not found' USING ERRCODE = '22023';
  END IF;

  SELECT moderation_state INTO previous_state
  FROM public.listing_moderation
  WHERE listing_id = p_listing_id;
  previous_state := COALESCE(previous_state, 'clear');
  IF previous_state = p_moderation_state THEN
    RETURN;
  END IF;

  INSERT INTO public.listing_moderation (listing_id, moderation_state, updated_at)
  VALUES (p_listing_id, p_moderation_state, CURRENT_TIMESTAMP)
  ON CONFLICT (listing_id) DO UPDATE
    SET moderation_state = EXCLUDED.moderation_state,
        updated_at = EXCLUDED.updated_at;

  event_action := CASE p_moderation_state
    WHEN 'hidden' THEN 'listing_hidden'
    ELSE 'listing_restored'
  END;
  PERFORM public.record_moderation_event(
    'listing', p_listing_id, event_action, normalized_note
  );
END;
$$;

ALTER FUNCTION public.set_listing_moderation_state(UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_listing_moderation_state(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_listing_moderation_state(UUID, TEXT, TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.set_user_moderation_state(
  p_user_id UUID,
  p_moderation_state TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $$
DECLARE
  actor_id UUID := auth.uid();
  previous_state TEXT;
  event_action TEXT;
  normalized_note TEXT := NULLIF(BTRIM(p_note), '');
BEGIN
  IF actor_id IS NULL OR NOT public.has_admin_role() THEN
    RAISE EXCEPTION 'admin authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_moderation_state IS NULL
    OR p_moderation_state NOT IN ('normal', 'suspended')
    OR char_length(COALESCE(normalized_note, '')) > 2000
  THEN
    RAISE EXCEPTION 'invalid user moderation input' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = '22023';
  END IF;

  SELECT moderation_state INTO previous_state
  FROM public.user_moderation
  WHERE user_id = p_user_id;
  previous_state := COALESCE(previous_state, 'normal');
  IF previous_state = p_moderation_state THEN
    RETURN;
  END IF;

  INSERT INTO public.user_moderation (user_id, moderation_state, updated_at)
  VALUES (p_user_id, p_moderation_state, CURRENT_TIMESTAMP)
  ON CONFLICT (user_id) DO UPDATE
    SET moderation_state = EXCLUDED.moderation_state,
        updated_at = EXCLUDED.updated_at;

  event_action := CASE p_moderation_state
    WHEN 'suspended' THEN 'user_suspended'
    ELSE 'user_reinstated'
  END;
  PERFORM public.record_moderation_event(
    'user', p_user_id, event_action, normalized_note
  );
END;
$$;

ALTER FUNCTION public.set_user_moderation_state(UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_user_moderation_state(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_user_moderation_state(UUID, TEXT, TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.is_current_user_suspended()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $$
DECLARE
  requester_id UUID := auth.uid();
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_moderation
    WHERE user_id = requester_id
      AND moderation_state = 'suspended'
  );
END;
$$;

ALTER FUNCTION public.is_current_user_suspended() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_current_user_suspended()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_current_user_suspended() TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_trust_safety_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $$
DECLARE
  requester_id UUID := auth.uid();
  conversation_row RECORD;
  message_row RECORD;
  event_action TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF auth.role() IS DISTINCT FROM 'authenticated'
      OR requester_id IS NULL
      OR NOT public.has_admin_role()
    THEN
      RAISE EXCEPTION 'admin authorization required for report moderation'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.reporter_id IS DISTINCT FROM OLD.reporter_id
      OR NEW.target_type IS DISTINCT FROM OLD.target_type
      OR NEW.target_id IS DISTINCT FROM OLD.target_id
      OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
      OR NEW.reported_user_id IS DISTINCT FROM OLD.reported_user_id
      OR NEW.reason IS DISTINCT FROM OLD.reason
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'report content and reporter are immutable'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status = OLD.status THEN
      RAISE EXCEPTION 'report moderation must advance the status'
        USING ERRCODE = '42501';
    END IF;
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('reviewed', 'resolved', 'dismissed'))
      OR (OLD.status = 'reviewed' AND NEW.status IN ('resolved', 'dismissed'))
    ) THEN
      RAISE EXCEPTION 'invalid report status transition'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status IN ('resolved', 'dismissed') THEN
      NEW.resolution_note := NULLIF(BTRIM(NEW.resolution_note), '');
      IF char_length(COALESCE(NEW.resolution_note, '')) > 2000 THEN
        RAISE EXCEPTION 'resolution note is too long'
          USING ERRCODE = '22023';
      END IF;
      event_action := CASE NEW.status
        WHEN 'resolved' THEN 'report_resolved'
        ELSE 'report_dismissed'
      END;
    ELSE
      NEW.resolution_note := NULL;
      event_action := 'report_reviewed';
    END IF;

    NEW.updated_at := CURRENT_TIMESTAMP;
    PERFORM public.record_moderation_event(
      'report',
      NEW.id,
      event_action,
      NEW.resolution_note,
      NEW.id
    );
    RETURN NEW;
  END IF;

  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'authentication required to create a report'
      USING ERRCODE = '42501';
  END IF;

  NEW.reporter_id := requester_id;
  NEW.status := 'pending';
  NEW.created_at := CURRENT_TIMESTAMP;
  NEW.updated_at := CURRENT_TIMESTAMP;
  NEW.listing_id := NULL;
  NEW.reported_user_id := NULL;
  NEW.resolution_note := NULL;

  IF NEW.target_type = 'user' THEN
    IF NEW.target_id = requester_id OR NOT EXISTS (
      SELECT 1 FROM public.profiles AS profile WHERE profile.id = NEW.target_id
    ) THEN
      RAISE EXCEPTION 'invalid or self-report target'
        USING ERRCODE = '22023';
    END IF;
    NEW.reported_user_id := NEW.target_id;
  ELSIF NEW.target_type = 'listing' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE listing.id = NEW.target_id
        AND listing.seller_id <> requester_id
    ) THEN
      RAISE EXCEPTION 'invalid or self-report listing target'
        USING ERRCODE = '22023';
    END IF;
    NEW.listing_id := NEW.target_id;
  ELSIF NEW.target_type = 'conversation' THEN
    SELECT conversation.buyer_id, conversation.seller_id
    INTO conversation_row
    FROM public.conversations AS conversation
    WHERE conversation.id = NEW.target_id
      AND (conversation.buyer_id = requester_id OR conversation.seller_id = requester_id);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid conversation report target'
        USING ERRCODE = '22023';
    END IF;
    IF conversation_row.buyer_id = conversation_row.seller_id THEN
      RAISE EXCEPTION 'invalid conversation report target'
        USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.target_type = 'message' THEN
    SELECT message.sender_id, conversation.buyer_id, conversation.seller_id
    INTO message_row
    FROM public.messages AS message
    JOIN public.conversations AS conversation
      ON conversation.id = message.conversation_id
    WHERE message.id = NEW.target_id
      AND (conversation.buyer_id = requester_id OR conversation.seller_id = requester_id);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid message report target'
        USING ERRCODE = '22023';
    END IF;
    IF message_row.sender_id = requester_id
      OR message_row.buyer_id = message_row.seller_id
      OR message_row.sender_id NOT IN (message_row.buyer_id, message_row.seller_id)
    THEN
      RAISE EXCEPTION 'invalid message report target'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported report target type'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.validate_trust_safety_report() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.validate_trust_safety_report()
  FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS "Admins can update reports" ON public.reports;
CREATE POLICY "Admins can update reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (public.has_admin_role())
  WITH CHECK (public.has_admin_role());

GRANT UPDATE (status, resolution_note) ON TABLE public.reports TO authenticated;
REVOKE UPDATE ON TABLE public.reports FROM service_role;

COMMENT ON TABLE public.listing_moderation IS
  'Admin-controlled marketplace moderation, separate from seller lifecycle. Missing row means clear.';
COMMENT ON TABLE public.user_moderation IS
  'Private admin-controlled account restriction state. Missing row means normal.';
COMMENT ON TABLE public.moderation_events IS
  'Append-only history of report, listing, and user moderation actions.';
COMMENT ON COLUMN public.moderation_events.report_id IS
  'Logical report link without a foreign key so report deletion cannot mutate audit history.';
COMMENT ON COLUMN public.reports.resolution_note IS
  'Reporter-visible note for a resolved or dismissed report; the associated audit event retains the same note.';
