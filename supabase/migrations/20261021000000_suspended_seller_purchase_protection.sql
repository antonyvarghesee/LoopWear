ALTER TABLE public.payment_webhook_events
  DROP CONSTRAINT IF EXISTS payment_webhook_events_outcome_check;

ALTER TABLE public.payment_webhook_events
  ADD CONSTRAINT payment_webhook_events_outcome_check
  CHECK (outcome IN ('processing', 'processed', 'duplicate', 'rejected', 'refund_required'));

ALTER TABLE public.provider_checkout_attempts
  DROP CONSTRAINT IF EXISTS provider_checkout_attempts_response_state_check;

ALTER TABLE public.provider_checkout_attempts
  ADD CONSTRAINT provider_checkout_attempts_response_state_check
  CHECK (response_state IN (
    'pending', 'verified_success', 'verified_failure', 'verified_cancelled',
    'confirmed', 'refund_required'
  ));

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
        FROM public.listing_moderation AS listing_state
        WHERE listing_state.listing_id = listing.id
          AND listing_state.moderation_state = 'hidden'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_moderation AS seller_state
        WHERE seller_state.user_id = listing.seller_id
          AND seller_state.moderation_state = 'suspended'
      )
  );
$$;

ALTER FUNCTION public.is_listing_publicly_available(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_listing_publicly_available(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_listing_publicly_available(UUID)
  TO anon, authenticated;

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
  THEN
    RAISE EXCEPTION 'listing or buyer is not available for checkout' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = listing_row.seller_id FOR SHARE;
  IF NOT FOUND OR NOT public.is_listing_publicly_available(p_listing_id)
    OR EXISTS (
      SELECT 1 FROM public.listing_moderation AS listing_state
      WHERE listing_state.listing_id = p_listing_id
        AND listing_state.moderation_state = 'hidden'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_moderation AS seller_state
      WHERE seller_state.user_id = listing_row.seller_id
        AND seller_state.moderation_state = 'suspended'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_moderation AS buyer_state
      WHERE buyer_state.user_id = p_buyer_id
        AND buyer_state.moderation_state = 'suspended'
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
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_provider_checkout_attempt(
  TEXT, TEXT, UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_provider_checkout_attempt(
  p_payment_provider TEXT,
  p_provider_transaction_id TEXT
)
RETURNS TABLE (
  payment_provider TEXT,
  provider_transaction_id TEXT,
  listing_id UUID,
  buyer_id UUID,
  seller_id UUID,
  amount NUMERIC,
  currency TEXT,
  productinfo TEXT,
  firstname TEXT,
  email TEXT,
  response_state TEXT,
  current_selling_price NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'checkout attempt lookup requires service role' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT attempts.payment_provider, attempts.provider_transaction_id,
    attempts.listing_id, attempts.buyer_id, attempts.seller_id, attempts.amount,
    attempts.currency, attempts.productinfo, attempts.firstname, attempts.email,
    attempts.response_state, listings.selling_price
  FROM public.provider_checkout_attempts AS attempts
  LEFT JOIN public.listings AS listings ON listings.id = attempts.listing_id
  WHERE attempts.payment_provider = LOWER(BTRIM(p_payment_provider))
    AND attempts.provider_transaction_id = p_provider_transaction_id
    AND (
      attempts.expires_at > NOW()
      OR attempts.response_state IN (
        'pending', 'verified_success', 'confirmed', 'refund_required'
      )
    );
END;
$$;

ALTER FUNCTION public.get_provider_checkout_attempt(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_provider_checkout_attempt(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_provider_checkout_attempt(TEXT, TEXT)
  TO service_role;

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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active listing not found' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = listing_seller_id FOR SHARE;
  IF NOT FOUND OR NOT public.is_listing_publicly_available(p_listing_id)
    OR EXISTS (
      SELECT 1 FROM public.listing_moderation AS listing_state
      WHERE listing_state.listing_id = p_listing_id
        AND listing_state.moderation_state = 'hidden'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_moderation AS seller_state
      WHERE seller_state.user_id = listing_seller_id
        AND seller_state.moderation_state = 'suspended'
    )
  THEN
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

CREATE OR REPLACE FUNCTION public.confirm_provider_purchase(
  p_payment_provider TEXT,
  p_event_id TEXT,
  p_event_type TEXT,
  p_provider_checkout_id TEXT,
  p_provider_payment_id TEXT,
  p_listing_id UUID,
  p_buyer_id UUID,
  p_seller_id UUID,
  p_amount_minor BIGINT,
  p_currency TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inserted_event_id TEXT;
  attempt_row RECORD;
  listing_row RECORD;
  existing_order RECORD;
  existing_payment RECORD;
  order_id UUID;
  is_payu BOOLEAN;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'purchase confirmation requires service role' USING ERRCODE = '42501';
  END IF;

  IF p_payment_provider IS NULL OR BTRIM(p_payment_provider) = ''
    OR p_event_id IS NULL OR p_event_id = ''
    OR p_event_type IS NULL OR p_event_type = ''
    OR p_provider_checkout_id IS NULL OR p_provider_checkout_id = ''
    OR p_provider_payment_id IS NULL OR p_provider_payment_id = ''
    OR p_listing_id IS NULL OR p_buyer_id IS NULL OR p_seller_id IS NULL
    OR p_amount_minor IS NULL OR p_amount_minor <= 0
    OR p_currency IS NULL
  THEN
    RAISE EXCEPTION 'invalid verified payment details' USING ERRCODE = '22023';
  END IF;

  p_payment_provider := LOWER(BTRIM(p_payment_provider));
  is_payu := p_payment_provider = 'payu';

  IF (is_payu AND LOWER(p_currency) <> 'inr')
    OR (NOT is_payu AND LOWER(p_currency) <> 'usd')
  THEN
    RAISE EXCEPTION 'unsupported payment currency' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_payment_provider || ':' || p_provider_payment_id, 0)
  );

  IF is_payu THEN
    IF p_event_id <> p_provider_checkout_id
      OR p_provider_checkout_id <> p_provider_payment_id
      OR p_event_type <> 'payu.payment.success'
    THEN
      RETURN 'rejected_payment_identifier_mismatch';
    END IF;

    SELECT attempts.*
    INTO attempt_row
    FROM public.provider_checkout_attempts AS attempts
    WHERE attempts.payment_provider = 'payu'
      AND attempts.provider_transaction_id = p_provider_checkout_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN 'rejected_attempt_missing';
    END IF;

    IF attempt_row.provider_transaction_id <> p_event_id
      OR attempt_row.listing_id <> p_listing_id
      OR attempt_row.buyer_id <> p_buyer_id
      OR attempt_row.seller_id <> p_seller_id
      OR attempt_row.amount <> p_amount_minor::NUMERIC / 100
      OR LOWER(attempt_row.currency) <> 'inr'
    THEN
      RETURN 'rejected_attempt_mismatch';
    END IF;

    IF attempt_row.response_state = 'refund_required' THEN
      RETURN 'refund_required';
    END IF;

    IF attempt_row.response_state = 'confirmed' THEN
      SELECT orders.*
      INTO existing_order
      FROM public.orders AS orders
      JOIN public.payments AS payments
        ON payments.order_id = orders.id
      WHERE orders.payment_provider = 'payu'
        AND orders.provider_checkout_id = p_provider_checkout_id
        AND orders.provider_payment_id = p_provider_payment_id
        AND orders.listing_id = p_listing_id
        AND orders.buyer_id = p_buyer_id
        AND orders.seller_id = p_seller_id
        AND orders.amount = p_amount_minor::NUMERIC / 100
        AND orders.status = 'paid'
        AND payments.payment_provider = 'payu'
        AND payments.provider_payment_id = p_provider_payment_id
        AND payments.amount = p_amount_minor::NUMERIC / 100
        AND LOWER(payments.currency) = 'inr'
        AND payments.status = 'succeeded'
      LIMIT 1;

      IF FOUND THEN
        RETURN 'duplicate_confirmed';
      END IF;
      RETURN 'rejected_attempt_state';
    END IF;

    IF attempt_row.response_state NOT IN ('pending', 'verified_success') THEN
      RETURN 'rejected_attempt_expired_or_consumed';
    END IF;
  END IF;

  INSERT INTO public.payment_webhook_events (
    payment_provider, event_id, event_type, provider_checkout_id, outcome
  )
  VALUES (
    p_payment_provider, p_event_id, p_event_type, p_provider_checkout_id, 'processing'
  )
  ON CONFLICT (payment_provider, event_id) DO NOTHING
  RETURNING event_id INTO inserted_event_id;

  IF inserted_event_id IS NULL THEN
    SELECT orders.*
    INTO existing_order
    FROM public.orders AS orders
    JOIN public.payments AS payments
      ON payments.order_id = orders.id
    WHERE orders.payment_provider = p_payment_provider
      AND orders.provider_checkout_id = p_provider_checkout_id
      AND orders.provider_payment_id = p_provider_payment_id
      AND orders.listing_id = p_listing_id
      AND orders.buyer_id = p_buyer_id
      AND orders.seller_id = p_seller_id
      AND orders.amount = p_amount_minor::NUMERIC / 100
      AND orders.status = 'paid'
      AND payments.payment_provider = p_payment_provider
      AND payments.provider_payment_id = p_provider_payment_id
      AND payments.amount = p_amount_minor::NUMERIC / 100
      AND LOWER(payments.currency) = LOWER(p_currency)
      AND payments.status = 'succeeded'
    LIMIT 1;

    IF FOUND THEN
      IF is_payu THEN
        UPDATE public.provider_checkout_attempts
        SET response_state = 'confirmed'
        WHERE payment_provider = 'payu'
          AND provider_transaction_id = p_provider_checkout_id
          AND response_state IN ('pending', 'verified_success');
      END IF;
      RETURN CASE WHEN is_payu THEN 'duplicate_confirmed' ELSE 'duplicate' END;
    END IF;
    RETURN 'rejected_duplicate_event';
  END IF;

  IF is_payu THEN
    IF attempt_row.expires_at <= NOW() THEN
      UPDATE public.payment_webhook_events SET outcome = 'refund_required'
      WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
      UPDATE public.provider_checkout_attempts
      SET response_state = 'refund_required'
      WHERE payment_provider = 'payu'
        AND provider_transaction_id = p_provider_checkout_id
        AND response_state IN ('pending', 'verified_success');
      RETURN 'refund_required';
    END IF;
  END IF;

  SELECT orders.*
  INTO existing_order
  FROM public.orders AS orders
  WHERE (orders.payment_provider = p_payment_provider
         AND orders.provider_checkout_id = p_provider_checkout_id)
     OR (orders.payment_provider = p_payment_provider
         AND orders.provider_payment_id = p_provider_payment_id)
  LIMIT 1;

  IF FOUND THEN
    SELECT payments.*
    INTO existing_payment
    FROM public.payments AS payments
    WHERE payments.order_id = existing_order.id
      AND payments.payment_provider = p_payment_provider
      AND payments.provider_payment_id = p_provider_payment_id
      AND payments.status = 'succeeded'
      AND LOWER(payments.currency) = LOWER(p_currency);

    IF FOUND
      AND existing_order.provider_checkout_id = p_provider_checkout_id
      AND existing_order.provider_payment_id = p_provider_payment_id
      AND existing_order.listing_id = p_listing_id
      AND existing_order.buyer_id = p_buyer_id
      AND existing_order.seller_id = p_seller_id
      AND existing_order.amount = p_amount_minor::NUMERIC / 100
      AND existing_order.status = 'paid'
      AND existing_payment.amount = p_amount_minor::NUMERIC / 100
    THEN
      IF is_payu THEN
        UPDATE public.provider_checkout_attempts
        SET response_state = 'confirmed'
        WHERE payment_provider = 'payu'
          AND provider_transaction_id = p_provider_checkout_id
          AND response_state IN ('pending', 'verified_success');
      END IF;
      UPDATE public.payment_webhook_events SET outcome = 'duplicate'
      WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
      RETURN CASE WHEN is_payu THEN 'duplicate_confirmed' ELSE 'duplicate' END;
    END IF;

    UPDATE public.payment_webhook_events SET outcome = 'rejected'
    WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
    RETURN 'rejected_payment_identifier_reused';
  END IF;

  SELECT payments.*
  INTO existing_payment
  FROM public.payments AS payments
  WHERE payments.payment_provider = p_payment_provider
    AND payments.provider_payment_id = p_provider_payment_id;

  IF FOUND THEN
    UPDATE public.payment_webhook_events SET outcome = 'rejected'
    WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
    RETURN 'rejected_payment_identifier_reused';
  END IF;

  SELECT listings.id, listings.seller_id, listings.selling_price, listings.status
  INTO listing_row
  FROM public.listings
  WHERE listings.id = p_listing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.payment_webhook_events SET outcome = 'refund_required'
    WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
    IF is_payu THEN
      UPDATE public.provider_checkout_attempts
      SET response_state = 'refund_required'
      WHERE payment_provider = 'payu'
        AND provider_transaction_id = p_provider_checkout_id
        AND response_state IN ('pending', 'verified_success');
      RETURN 'refund_required';
    END IF;
    RETURN 'refund_required';
  END IF;

  IF listing_row.seller_id <> p_seller_id OR p_buyer_id = listing_row.seller_id THEN
    UPDATE public.payment_webhook_events SET outcome = 'refund_required'
    WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
    IF is_payu THEN
      UPDATE public.provider_checkout_attempts
      SET response_state = 'refund_required'
      WHERE payment_provider = 'payu'
        AND provider_transaction_id = p_provider_checkout_id
        AND response_state IN ('pending', 'verified_success');
    END IF;
    RETURN 'refund_required';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = listing_row.seller_id FOR SHARE;
  IF NOT FOUND OR listing_row.status <> 'ACTIVE'
    OR NOT public.is_listing_publicly_available(p_listing_id)
    OR EXISTS (
      SELECT 1 FROM public.listing_moderation AS listing_state
      WHERE listing_state.listing_id = p_listing_id
        AND listing_state.moderation_state = 'hidden'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_moderation AS seller_state
      WHERE seller_state.user_id = listing_row.seller_id
        AND seller_state.moderation_state = 'suspended'
    )
  THEN
    UPDATE public.payment_webhook_events SET outcome = 'refund_required'
    WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
    IF is_payu THEN
      UPDATE public.provider_checkout_attempts
      SET response_state = 'refund_required'
      WHERE payment_provider = 'payu'
        AND provider_transaction_id = p_provider_checkout_id
        AND response_state IN ('pending', 'verified_success');
    END IF;
    RETURN 'refund_required';
  END IF;

  IF listing_row.selling_price * 100 <> p_amount_minor THEN
    UPDATE public.payment_webhook_events SET outcome = 'refund_required'
    WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
    IF is_payu THEN
      UPDATE public.provider_checkout_attempts
      SET response_state = 'refund_required'
      WHERE payment_provider = 'payu'
        AND provider_transaction_id = p_provider_checkout_id
        AND response_state IN ('pending', 'verified_success');
    END IF;
    RETURN 'refund_required';
  END IF;

  UPDATE public.listings
  SET status = 'SOLD'
  WHERE id = p_listing_id AND status = 'ACTIVE';

  IF NOT FOUND THEN
    UPDATE public.payment_webhook_events SET outcome = 'refund_required'
    WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
    IF is_payu THEN
      UPDATE public.provider_checkout_attempts
      SET response_state = 'refund_required'
      WHERE payment_provider = 'payu'
        AND provider_transaction_id = p_provider_checkout_id
        AND response_state IN ('pending', 'verified_success');
    END IF;
    RETURN 'refund_required';
  END IF;

  INSERT INTO public.orders (
    buyer_id, seller_id, listing_id, amount, status,
    payment_provider, provider_payment_id, provider_checkout_id
  )
  VALUES (
    p_buyer_id, p_seller_id, p_listing_id, p_amount_minor::NUMERIC / 100, 'paid',
    p_payment_provider, p_provider_payment_id, p_provider_checkout_id
  )
  RETURNING id INTO order_id;

  INSERT INTO public.payments (
    order_id, payment_provider, provider_payment_id, amount, currency, status
  )
  VALUES (
    order_id, p_payment_provider, p_provider_payment_id,
    p_amount_minor::NUMERIC / 100, LOWER(p_currency), 'succeeded'
  );

  IF is_payu THEN
    UPDATE public.provider_checkout_attempts
    SET response_state = 'confirmed'
    WHERE payment_provider = 'payu'
      AND provider_transaction_id = p_provider_checkout_id
      AND response_state IN ('pending', 'verified_success')
      AND expires_at > NOW();

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PayU checkout attempt changed during confirmation' USING ERRCODE = '40001';
    END IF;
  END IF;

  UPDATE public.payment_webhook_events SET outcome = 'processed'
  WHERE payment_provider = p_payment_provider AND event_id = p_event_id;

  RETURN 'processed';
END;
$$;

ALTER FUNCTION public.confirm_provider_purchase(
  TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, BIGINT, TEXT
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.confirm_provider_purchase(
  TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, BIGINT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_provider_purchase(
  TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, BIGINT, TEXT
) TO service_role;
