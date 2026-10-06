CREATE OR REPLACE FUNCTION public.is_listing_publicly_available(p_listing_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.listings AS listing
    WHERE listing.id = p_listing_id
      AND listing.status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1
        FROM public.listing_moderation AS moderation
        WHERE moderation.listing_id = listing.id
          AND moderation.moderation_state = 'hidden'
      )
  );
$$;

ALTER FUNCTION public.is_listing_publicly_available(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_listing_publicly_available(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_listing_publicly_available(UUID)
  TO anon, authenticated;

DROP POLICY IF EXISTS "Active listings are public and sellers can view their own"
  ON public.listings;
CREATE POLICY "Active listings are public and sellers can view their own"
  ON public.listings FOR SELECT
  USING (
    seller_id = (SELECT auth.uid())
    OR public.is_listing_publicly_available(id)
  );

DROP POLICY IF EXISTS "Authenticated sellers can create their own drafts"
  ON public.listings;
CREATE POLICY "Authenticated sellers can create their own drafts"
  ON public.listings FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = seller_id
    AND status = 'DRAFT'
    AND NOT public.is_current_user_suspended()
  );

DROP POLICY IF EXISTS "Sellers can update their own listings"
  ON public.listings;
CREATE POLICY "Sellers can update their own listings"
  ON public.listings FOR UPDATE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() = seller_id
    AND NOT public.is_current_user_suspended()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = seller_id
    AND NOT public.is_current_user_suspended()
  );

CREATE OR REPLACE FUNCTION public.get_public_seller_profiles_for_listings(p_listing_ids UUID[])
RETURNS TABLE (
  listing_id UUID,
  username TEXT,
  full_name TEXT,
  avatar_url TEXT,
  rating NUMERIC,
  review_count INTEGER,
  is_verified BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  SELECT listing.id, profile.username, profile.full_name, profile.avatar_url,
         profile.rating, profile.review_count, profile.is_verified
  FROM public.listings AS listing
  JOIN public.profiles AS profile ON profile.id = listing.seller_id
  WHERE p_listing_ids IS NOT NULL
    AND cardinality(p_listing_ids) BETWEEN 1 AND 24
    AND listing.id = ANY(p_listing_ids)
    AND public.is_listing_publicly_available(listing.id);
$$;

ALTER FUNCTION public.get_public_seller_profiles_for_listings(UUID[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_seller_profiles_for_listings(UUID[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_seller_profiles_for_listings(UUID[])
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_seller_active_listings(p_username TEXT, p_page INTEGER)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  WITH seller AS (
    SELECT profile.id, profile.username, profile.full_name, profile.avatar_url,
           profile.rating, profile.review_count, profile.is_verified
    FROM public.profiles AS profile
    WHERE profile.username = p_username
      AND p_username ~ '^[A-Za-z0-9_]{3,20}$'
      AND p_page BETWEEN 1 AND 100000
  ), active_listings AS (
    SELECT listing.id, listing.title, listing.slug, listing.description,
           listing.category_id, listing.brand_id, listing.gender, listing.size,
           listing.condition, listing.color, listing.material,
           listing.original_price, listing.selling_price, listing.location,
           listing.status, listing.created_at, listing.updated_at,
           category.name AS category_name, category.slug AS category_slug,
           brand.name AS brand_name, brand.slug AS brand_slug,
           seller.username AS seller_username, seller.full_name AS seller_full_name,
           seller.avatar_url AS seller_avatar_url, seller.rating AS seller_rating,
           seller.review_count AS seller_review_count, seller.is_verified AS seller_is_verified
    FROM public.listings AS listing
    JOIN seller ON seller.id = listing.seller_id
    LEFT JOIN public.categories AS category ON category.id = listing.category_id
    LEFT JOIN public.brands AS brand ON brand.id = listing.brand_id
    WHERE public.is_listing_publicly_available(listing.id)
  ), counted AS (
    SELECT count(*)::INTEGER AS total FROM active_listings
  ), page_rows AS (
    SELECT * FROM active_listings
    ORDER BY created_at DESC, id
    LIMIT 12 OFFSET ((p_page - 1) * 12)
  )
  SELECT jsonb_build_object(
    'total', counted.total,
    'listings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', page_item.id,
        'title', page_item.title,
        'slug', page_item.slug,
        'description', page_item.description,
        'category_id', page_item.category_id,
        'brand_id', page_item.brand_id,
        'gender', page_item.gender,
        'size', page_item.size,
        'condition', page_item.condition,
        'color', page_item.color,
        'material', page_item.material,
        'original_price', page_item.original_price,
        'selling_price', page_item.selling_price,
        'location', page_item.location,
        'status', page_item.status,
        'created_at', page_item.created_at,
        'updated_at', page_item.updated_at,
        'categories', CASE WHEN page_item.category_name IS NULL THEN NULL ELSE jsonb_build_object('name', page_item.category_name, 'slug', page_item.category_slug) END,
        'brands', CASE WHEN page_item.brand_name IS NULL THEN NULL ELSE jsonb_build_object('name', page_item.brand_name, 'slug', page_item.brand_slug) END,
        'profiles', jsonb_build_object(
          'username', page_item.seller_username,
          'full_name', page_item.seller_full_name,
          'avatar_url', page_item.seller_avatar_url,
          'rating', page_item.seller_rating,
          'review_count', page_item.seller_review_count,
          'is_verified', page_item.seller_is_verified
        )
      ) ORDER BY page_item.created_at DESC, page_item.id)
      FROM page_rows AS page_item
    ), '[]'::JSONB)
  )
  FROM counted;
$$;

ALTER FUNCTION public.get_seller_active_listings(TEXT, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_seller_active_listings(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_active_listings(TEXT, INTEGER)
  TO anon, authenticated;

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
  IF p_user_id = actor_id THEN
    RAISE EXCEPTION 'admins cannot change their own moderation state' USING ERRCODE = '42501';
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

DROP POLICY IF EXISTS "Active listing images are public; sellers can view own"
  ON public.listing_images;
CREATE POLICY "Active listing images are public; sellers can view own"
  ON public.listing_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE listing.id = listing_id
        AND (
          listing.seller_id = (SELECT auth.uid())
          OR public.is_listing_publicly_available(listing.id)
        )
    )
  );

DROP POLICY IF EXISTS "Sellers can add images to editable own listings"
  ON public.listing_images;
CREATE POLICY "Sellers can add images to editable own listings"
  ON public.listing_images FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE listing.id = listing_id
        AND listing.seller_id = auth.uid()
        AND listing.status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')
    )
    AND NOT public.is_current_user_suspended()
  );

DROP POLICY IF EXISTS "Sellers can delete images of editable own listings"
  ON public.listing_images;
CREATE POLICY "Sellers can delete images of editable own listings"
  ON public.listing_images FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE listing.id = listing_id
        AND listing.seller_id = auth.uid()
        AND listing.status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')
    )
    AND NOT public.is_current_user_suspended()
  );

DROP POLICY IF EXISTS "Sellers can reorder images of editable own listings"
  ON public.listing_images;
CREATE POLICY "Sellers can reorder images of editable own listings"
  ON public.listing_images FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE listing.id = listing_id
        AND listing.seller_id = auth.uid()
        AND listing.status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')
    )
    AND NOT public.is_current_user_suspended()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE listing.id = listing_id
        AND listing.seller_id = auth.uid()
        AND listing.status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')
    )
    AND NOT public.is_current_user_suspended()
  );

DROP POLICY IF EXISTS "Active listing image objects can be read" ON storage.objects;
CREATE POLICY "Active listing image objects can be read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'listing-images'
    AND EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE listing.id::text = (storage.foldername(name))[2]
        AND listing.seller_id::text = (storage.foldername(name))[1]
        AND EXISTS (
          SELECT 1 FROM public.listing_images AS image
          WHERE image.listing_id = listing.id
            AND image.storage_path = storage.objects.name
        )
        AND (
          listing.seller_id = auth.uid()
          OR public.is_listing_publicly_available(listing.id)
        )
    )
  );

DROP POLICY IF EXISTS "Listing image owners can upload" ON storage.objects;
CREATE POLICY "Listing image owners can upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'listing-images'
    AND auth.uid() IS NOT NULL
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND NOT public.is_current_user_suspended()
    AND EXISTS (
      SELECT 1 FROM public.listings AS listing
      WHERE listing.id::text = (storage.foldername(name))[2]
        AND listing.seller_id = auth.uid()
        AND listing.status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')
    )
  );

DROP POLICY IF EXISTS "Listing image owners can delete" ON storage.objects;
CREATE POLICY "Listing image owners can delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'listing-images'
    AND auth.uid() IS NOT NULL
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND NOT public.is_current_user_suspended()
    AND EXISTS (
      SELECT 1 FROM public.listings AS listing
      WHERE listing.id::text = (storage.foldername(name))[2]
        AND listing.seller_id = auth.uid()
        AND listing.status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')
    )
  );

CREATE OR REPLACE FUNCTION public.can_send_conversation_message(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $$
  SELECT NOT public.is_current_user_suspended()
    AND EXISTS (
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

ALTER FUNCTION public.can_send_conversation_message(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_send_conversation_message(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_send_conversation_message(UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_or_create_listing_conversation(p_listing_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $$
DECLARE
  requester_id UUID := auth.uid();
  listing_seller_id UUID;
  result_id UUID;
BEGIN
  IF requester_id IS NULL OR public.is_current_user_suspended() THEN
    RAISE EXCEPTION 'messaging is unavailable for this user' USING ERRCODE = '42501';
  END IF;

  SELECT listing.seller_id INTO listing_seller_id
  FROM public.listings AS listing
  WHERE listing.id = p_listing_id
    AND listing.status = 'ACTIVE'
  FOR SHARE;
  IF NOT FOUND OR NOT public.is_listing_publicly_available(p_listing_id) THEN
    RAISE EXCEPTION 'active listing not found' USING ERRCODE = '22023';
  END IF;
  IF listing_seller_id = requester_id THEN
    RAISE EXCEPTION 'cannot message yourself' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks AS block
    WHERE (block.blocker_id = requester_id AND block.blocked_id = listing_seller_id)
       OR (block.blocker_id = listing_seller_id AND block.blocked_id = requester_id)
  ) THEN
    RAISE EXCEPTION 'messaging is unavailable for this user' USING ERRCODE = '42501';
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

ALTER FUNCTION public.get_or_create_listing_conversation(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_or_create_listing_conversation(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_listing_conversation(UUID)
  TO authenticated;

DROP POLICY IF EXISTS "Messaging participants can send own messages" ON public.messages;
CREATE POLICY "Messaging participants can send own messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND char_length(btrim(content)) BETWEEN 1 AND 2000
    AND NOT public.is_current_user_suspended()
    AND public.can_send_conversation_message(conversation_id)
  );

CREATE OR REPLACE FUNCTION public.prepare_purchase_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $$
DECLARE
  requester_id UUID := auth.uid();
  order_row RECORD;
BEGIN
  IF requester_id IS NULL OR public.is_current_user_suspended() THEN
    RAISE EXCEPTION 'account is not eligible to create a review'
      USING ERRCODE = '42501';
  END IF;

  SELECT purchase.buyer_id, purchase.seller_id, purchase.listing_id
  INTO order_row
  FROM public.orders AS purchase
  JOIN public.listings AS listing
    ON listing.id = purchase.listing_id
   AND listing.seller_id = purchase.seller_id
  JOIN public.payments AS payment
    ON payment.order_id = purchase.id
   AND payment.status = 'succeeded'
   AND payment.amount = purchase.amount
  WHERE purchase.id = NEW.order_id
    AND purchase.status = 'delivered'
    AND purchase.buyer_id = requester_id
    AND purchase.buyer_id <> purchase.seller_id
  FOR SHARE OF purchase, listing, payment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'review requires a delivered purchase by the authenticated buyer'
      USING ERRCODE = '42501';
  END IF;

  NEW.reviewer_id := order_row.buyer_id;
  NEW.reviewee_id := order_row.seller_id;
  NEW.listing_id := order_row.listing_id;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.prepare_purchase_review() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prepare_purchase_review()
  FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS "Buyers can create reviews for completed purchases" ON public.reviews;
CREATE POLICY "Buyers can create reviews for completed purchases"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = (SELECT auth.uid())
    AND NOT public.is_current_user_suspended()
  );

CREATE OR REPLACE FUNCTION public.register_provider_checkout_attempt(
  p_payment_provider TEXT,
  p_provider_transaction_id TEXT,
  p_listing_id UUID,
  p_buyer_id UUID,
  p_seller_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_productinfo TEXT,
  p_firstname TEXT,
  p_email TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  listing_row RECORD;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'checkout attempt registration requires service role' USING ERRCODE = '42501';
  END IF;

  IF p_payment_provider IS NULL OR BTRIM(p_payment_provider) = ''
    OR p_provider_transaction_id IS NULL OR BTRIM(p_provider_transaction_id) = ''
    OR p_listing_id IS NULL OR p_buyer_id IS NULL OR p_seller_id IS NULL
    OR p_amount IS NULL OR p_amount <= 0
    OR p_currency IS NULL OR LOWER(p_currency) <> 'inr'
    OR p_productinfo IS NULL OR p_productinfo = ''
    OR p_firstname IS NULL OR p_firstname = ''
    OR p_email IS NULL OR p_email = ''
  THEN
    RAISE EXCEPTION 'invalid checkout attempt' USING ERRCODE = '22023';
  END IF;

  SELECT listings.seller_id, listings.selling_price, listings.status
  INTO listing_row
  FROM public.listings AS listings
  WHERE listings.id = p_listing_id
  FOR UPDATE;

  IF NOT FOUND OR listing_row.status <> 'ACTIVE'
    OR listing_row.seller_id <> p_seller_id
    OR p_buyer_id = listing_row.seller_id
    OR listing_row.selling_price <> p_amount
    OR NOT public.is_listing_publicly_available(p_listing_id)
    OR EXISTS (
      SELECT 1 FROM public.user_moderation AS moderation
      WHERE moderation.user_id = p_buyer_id
        AND moderation.moderation_state = 'suspended'
    )
  THEN
    RAISE EXCEPTION 'listing or buyer is not available for checkout' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.provider_checkout_attempts (
    payment_provider, provider_transaction_id, listing_id, buyer_id, seller_id,
    amount, currency, productinfo, firstname, email
  )
  VALUES (
    LOWER(BTRIM(p_payment_provider)), p_provider_transaction_id, p_listing_id,
    p_buyer_id, p_seller_id, p_amount, LOWER(p_currency), p_productinfo,
    p_firstname, p_email
  );
END;
$$;

ALTER FUNCTION public.register_provider_checkout_attempt(
  TEXT, TEXT, UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.register_provider_checkout_attempt(
  TEXT, TEXT, UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_provider_checkout_attempt(
  TEXT, TEXT, UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT
) TO service_role;
