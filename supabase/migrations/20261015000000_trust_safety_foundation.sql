ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS target_type TEXT,
  ADD COLUMN IF NOT EXISTS target_id UUID,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.reports
    WHERE listing_id IS NULL
      AND reported_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Existing reports without a user or listing target must be reviewed before Trust & Safety migration';
  END IF;
END;
$$;

UPDATE public.reports
SET target_type = CASE
      WHEN reported_user_id IS NOT NULL THEN 'user'
      ELSE 'listing'
    END,
    target_id = COALESCE(reported_user_id, listing_id),
    updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
WHERE target_type IS NULL OR target_id IS NULL OR updated_at IS NULL;

ALTER TABLE public.reports
  ALTER COLUMN target_type SET NOT NULL,
  ALTER COLUMN target_id SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_target_type_check
    CHECK (target_type IN ('user', 'listing', 'conversation', 'message')),
  ADD CONSTRAINT reports_reason_length_check
    CHECK (char_length(btrim(reason)) BETWEEN 1 AND 100) NOT VALID,
  ADD CONSTRAINT reports_description_length_check
    CHECK (description IS NULL OR char_length(description) <= 2000) NOT VALID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.reports
    WHERE status IN ('pending', 'reviewed')
    GROUP BY reporter_id, target_type, target_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate active reports exist; resolve them before Trust & Safety migration';
  END IF;
END;
$$;

CREATE UNIQUE INDEX reports_one_active_per_reporter_target_idx
  ON public.reports (reporter_id, target_type, target_id)
  WHERE status IN ('pending', 'reviewed');

CREATE INDEX reports_target_created_at_idx
  ON public.reports (target_type, target_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_trust_safety_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  requester_id UUID := auth.uid();
  conversation_row RECORD;
  message_row RECORD;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'report moderation requires service role'
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

    NEW.updated_at := CURRENT_TIMESTAMP;
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

REVOKE ALL ON FUNCTION public.validate_trust_safety_report()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_reports_validate_trust_safety ON public.reports;
CREATE TRIGGER tr_reports_validate_trust_safety
  BEFORE INSERT OR UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.validate_trust_safety_report();

DROP POLICY IF EXISTS "Reporters can view own reports" ON public.reports;
DROP POLICY IF EXISTS "Users can submit reports" ON public.reports;
DROP POLICY IF EXISTS "Reporters can read own reports" ON public.reports;
DROP POLICY IF EXISTS "Authenticated users can submit reports" ON public.reports;
CREATE POLICY "Reporters can read own reports"
  ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = (SELECT auth.uid()));
CREATE POLICY "Authenticated users can submit reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (SELECT auth.uid()) AND status = 'pending');

REVOKE ALL PRIVILEGES ON TABLE public.reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.reports TO authenticated;
GRANT INSERT (target_type, target_id, reason, description)
  ON TABLE public.reports TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.reports TO service_role;

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_blocks_pk PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS user_blocks_blocked_id_idx
  ON public.user_blocks (blocked_id);

CREATE OR REPLACE FUNCTION public.set_trust_safety_block_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required to block a user'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.blocked_id = auth.uid() THEN
    RAISE EXCEPTION 'users cannot block themselves'
      USING ERRCODE = '22023';
  END IF;

  NEW.blocker_id := auth.uid();
  NEW.created_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_trust_safety_block_owner()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tr_user_blocks_set_owner
  BEFORE INSERT ON public.user_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_trust_safety_block_owner();

DROP POLICY IF EXISTS "Users can read own blocks" ON public.user_blocks;
DROP POLICY IF EXISTS "Users can create own blocks" ON public.user_blocks;
DROP POLICY IF EXISTS "Users can remove own blocks" ON public.user_blocks;
CREATE POLICY "Users can read own blocks"
  ON public.user_blocks FOR SELECT TO authenticated
  USING (blocker_id = (SELECT auth.uid()));
CREATE POLICY "Users can create own blocks"
  ON public.user_blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = (SELECT auth.uid()));
CREATE POLICY "Users can remove own blocks"
  ON public.user_blocks FOR DELETE TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE public.user_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT (blocker_id, blocked_id, created_at) ON public.user_blocks TO authenticated;
GRANT INSERT (blocked_id) ON public.user_blocks TO authenticated;
GRANT DELETE ON public.user_blocks TO authenticated;
GRANT ALL PRIVILEGES ON public.user_blocks TO service_role;

CREATE OR REPLACE FUNCTION public.can_send_conversation_message(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations AS conversation
    WHERE conversation.id = p_conversation_id
      AND (conversation.buyer_id = (SELECT auth.uid()) OR conversation.seller_id = (SELECT auth.uid()))
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_blocks AS block
        WHERE (block.blocker_id = conversation.buyer_id AND block.blocked_id = conversation.seller_id)
           OR (block.blocker_id = conversation.seller_id AND block.blocked_id = conversation.buyer_id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_send_conversation_message(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_conversation_message(UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_or_create_listing_conversation(p_listing_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  requester_id UUID := (SELECT auth.uid());
  listing_seller_id UUID;
  result_id UUID;
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT listing.seller_id INTO listing_seller_id
  FROM public.listings AS listing
  WHERE listing.id = p_listing_id AND listing.status = 'ACTIVE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active listing not found' USING ERRCODE = '22023';
  END IF;
  IF listing_seller_id = requester_id THEN
    RAISE EXCEPTION 'Cannot message yourself' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks AS block
    WHERE (block.blocker_id = requester_id AND block.blocked_id = listing_seller_id)
       OR (block.blocker_id = listing_seller_id AND block.blocked_id = requester_id)
  ) THEN
    RAISE EXCEPTION 'Messaging is unavailable for this user' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.conversations (listing_id, buyer_id, seller_id)
  VALUES (p_listing_id, requester_id, listing_seller_id)
  ON CONFLICT ON CONSTRAINT unique_buyer_seller_listing_conversation DO NOTHING;

  SELECT conversation.id INTO result_id
  FROM public.conversations AS conversation
  WHERE conversation.listing_id = p_listing_id
    AND conversation.buyer_id = requester_id
    AND conversation.seller_id = listing_seller_id;
  RETURN result_id;
END;
$$;

DROP POLICY IF EXISTS "Messaging participants can send own messages" ON public.messages;
CREATE POLICY "Messaging participants can send own messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND char_length(btrim(content)) BETWEEN 1 AND 2000
    AND public.can_send_conversation_message(conversation_id)
  );

REVOKE ALL ON FUNCTION public.get_or_create_listing_conversation(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_listing_conversation(UUID)
  TO authenticated;
