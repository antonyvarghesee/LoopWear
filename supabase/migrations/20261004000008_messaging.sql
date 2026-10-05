-- Tighten the original messaging tables without duplicating them.
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages
  ALTER COLUMN sender_id SET DEFAULT auth.uid(),
  ALTER COLUMN is_read SET DEFAULT FALSE,
  ALTER COLUMN created_at SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.conversations'::regclass
      AND conname = 'conversations_participants_distinct'
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_participants_distinct
      CHECK (buyer_id <> seller_id) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass
      AND conname = 'messages_content_length'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_content_length
      CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_buyer_activity
  ON public.conversations (buyer_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_seller_activity
  ON public.conversations (seller_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread_conversation
  ON public.messages (conversation_id, sender_id) WHERE is_read = FALSE;

DROP POLICY IF EXISTS "Participants can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can start conversations" ON public.conversations;
DROP POLICY IF EXISTS "Messaging participants can read conversations" ON public.conversations;
CREATE POLICY "Messaging participants can read conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (buyer_id <> seller_id AND ((SELECT auth.uid()) = buyer_id OR (SELECT auth.uid()) = seller_id));

DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
DROP POLICY IF EXISTS "Messaging participants can read messages" ON public.messages;
DROP POLICY IF EXISTS "Messaging participants can send own messages" ON public.messages;
DROP POLICY IF EXISTS "Recipients can mark messages read" ON public.messages;
CREATE POLICY "Messaging participants can read messages"
  ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations AS conversation
    WHERE conversation.id = conversation_id
      AND ((SELECT auth.uid()) = conversation.buyer_id OR (SELECT auth.uid()) = conversation.seller_id)
  ));
CREATE POLICY "Messaging participants can send own messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND char_length(btrim(content)) BETWEEN 1 AND 2000
    AND EXISTS (
      SELECT 1 FROM public.conversations AS conversation
      WHERE conversation.id = conversation_id
        AND ((SELECT auth.uid()) = conversation.buyer_id OR (SELECT auth.uid()) = conversation.seller_id)
    )
  );

-- No direct participant writes: conversation creation derives both identities
-- and the seller from the authenticated user and the ACTIVE listing.
REVOKE ALL ON TABLE public.conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.conversations TO authenticated;
GRANT SELECT (id, conversation_id, sender_id, content, is_read, created_at)
  ON TABLE public.messages TO authenticated;
GRANT INSERT (conversation_id, content) ON TABLE public.messages TO authenticated;

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
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT listing.seller_id INTO listing_seller_id
  FROM public.listings AS listing
  WHERE listing.id = p_listing_id AND listing.status = 'ACTIVE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active listing not found';
  END IF;
  IF listing_seller_id = requester_id THEN
    RAISE EXCEPTION 'Cannot message yourself';
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

-- A narrow projection keeps private conversation participant IDs out of the
-- inbox while returning only the other participant's public profile fields.
CREATE OR REPLACE FUNCTION public.get_messaging_conversations()
RETURNS TABLE (
  conversation_id UUID,
  listing_id UUID,
  listing_title TEXT,
  listing_slug TEXT,
  listing_active BOOLEAN,
  other_username TEXT,
  other_full_name TEXT,
  other_avatar_url TEXT,
  last_message_content TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT conversation.id,
         listing.id,
         listing.title,
         listing.slug,
         COALESCE(listing.status = 'ACTIVE', FALSE),
         other_profile.username,
         other_profile.full_name,
         other_profile.avatar_url,
         latest.content,
         latest.created_at,
         COALESCE(unread.total, 0)::BIGINT
  FROM public.conversations AS conversation
  LEFT JOIN public.listings AS listing ON listing.id = conversation.listing_id
  LEFT JOIN public.profiles AS other_profile
    ON other_profile.id = CASE WHEN conversation.buyer_id = (SELECT auth.uid())
                               THEN conversation.seller_id ELSE conversation.buyer_id END
  LEFT JOIN LATERAL (
    SELECT message.content, message.created_at
    FROM public.messages AS message
    WHERE message.conversation_id = conversation.id
    ORDER BY message.created_at DESC, message.id DESC
    LIMIT 1
  ) AS latest ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total
    FROM public.messages AS message
    WHERE message.conversation_id = conversation.id
      AND message.sender_id <> (SELECT auth.uid())
      AND message.is_read = FALSE
  ) AS unread ON TRUE
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND conversation.buyer_id <> conversation.seller_id
    AND ((SELECT auth.uid()) = conversation.buyer_id OR (SELECT auth.uid()) = conversation.seller_id)
  ORDER BY conversation.updated_at DESC, conversation.id DESC
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.get_messaging_conversation(p_conversation_id UUID)
RETURNS TABLE (
  conversation_id UUID,
  is_buyer BOOLEAN,
  listing_id UUID,
  listing_title TEXT,
  listing_slug TEXT,
  listing_active BOOLEAN,
  other_username TEXT,
  other_full_name TEXT,
  other_avatar_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT conversation.id,
         conversation.buyer_id = (SELECT auth.uid()),
         listing.id,
         listing.title,
         listing.slug,
         COALESCE(listing.status = 'ACTIVE', FALSE),
         other_profile.username,
         other_profile.full_name,
         other_profile.avatar_url
  FROM public.conversations AS conversation
  LEFT JOIN public.listings AS listing ON listing.id = conversation.listing_id
  LEFT JOIN public.profiles AS other_profile
    ON other_profile.id = CASE WHEN conversation.buyer_id = (SELECT auth.uid())
                               THEN conversation.seller_id ELSE conversation.buyer_id END
  WHERE conversation.id = p_conversation_id
    AND conversation.buyer_id <> conversation.seller_id
    AND ((SELECT auth.uid()) = conversation.buyer_id OR (SELECT auth.uid()) = conversation.seller_id)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.mark_messaging_conversation_read(p_conversation_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  requester_id UUID := (SELECT auth.uid());
  changed_count INTEGER;
BEGIN
  IF requester_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.conversations AS conversation
    WHERE conversation.id = p_conversation_id
      AND (conversation.buyer_id = requester_id OR conversation.seller_id = requester_id)
  ) THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  UPDATE public.messages AS message
  SET is_read = TRUE
  WHERE message.conversation_id = p_conversation_id
    AND message.sender_id <> requester_id
    AND message.is_read = FALSE;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_conversation_after_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_messages_touch_conversation ON public.messages;
CREATE TRIGGER tr_messages_touch_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_after_message();

REVOKE ALL ON FUNCTION public.get_or_create_listing_conversation(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_messaging_conversations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_messaging_conversation(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_messaging_conversation_read(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_listing_conversation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_messaging_conversations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_messaging_conversation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_messaging_conversation_read(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.touch_conversation_after_message() FROM PUBLIC, anon, authenticated;

-- messages was already in this publication in the initial schema. Keep this
-- migration safe for projects where the publication entry was removed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
