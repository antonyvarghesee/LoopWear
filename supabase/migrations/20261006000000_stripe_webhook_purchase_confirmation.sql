ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_checkout_session_id_idx
  ON public.orders (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_per_order_idx
  ON public.payments (order_id);

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  checkout_session_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('processing', 'processed', 'duplicate', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.stripe_webhook_events
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_stripe_checkout_purchase(
  p_event_id TEXT,
  p_event_type TEXT,
  p_checkout_session_id TEXT,
  p_payment_intent_id TEXT,
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
  listing_row RECORD;
  existing_order RECORD;
  existing_payment RECORD;
  order_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'purchase confirmation requires service role' USING ERRCODE = '42501';
  END IF;

  IF p_event_id IS NULL OR p_event_id = ''
    OR p_event_type IS NULL
    OR p_event_type NOT IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
    OR p_checkout_session_id IS NULL OR p_checkout_session_id = ''
    OR p_payment_intent_id IS NULL OR p_payment_intent_id = ''
    OR p_listing_id IS NULL OR p_buyer_id IS NULL OR p_seller_id IS NULL
    OR p_amount_minor IS NULL OR p_amount_minor <= 0
    OR p_currency IS NULL
    OR LOWER(p_currency) <> 'usd'
  THEN
    RAISE EXCEPTION 'invalid verified Stripe purchase details' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_payment_intent_id, 0));

  INSERT INTO public.stripe_webhook_events (event_id, event_type, checkout_session_id, outcome)
  VALUES (p_event_id, p_event_type, p_checkout_session_id, 'processing')
  ON CONFLICT (event_id) DO NOTHING
  RETURNING event_id INTO inserted_event_id;

  IF inserted_event_id IS NULL THEN
    RETURN 'duplicate';
  END IF;

  SELECT orders.*
  INTO existing_order
  FROM public.orders AS orders
  WHERE orders.stripe_checkout_session_id = p_checkout_session_id
     OR orders.stripe_payment_intent_id = p_payment_intent_id
  LIMIT 1;

  IF FOUND THEN
    SELECT payments.*
    INTO existing_payment
    FROM public.payments AS payments
    WHERE payments.order_id = existing_order.id
      AND payments.stripe_payment_intent_id = p_payment_intent_id
      AND payments.status = 'succeeded';

    IF FOUND
      AND existing_order.stripe_checkout_session_id = p_checkout_session_id
      AND existing_order.stripe_payment_intent_id = p_payment_intent_id
      AND existing_order.listing_id = p_listing_id
      AND existing_order.buyer_id = p_buyer_id
      AND existing_order.seller_id = p_seller_id
      AND existing_order.status = 'paid'
    THEN
      UPDATE public.stripe_webhook_events SET outcome = 'duplicate'
      WHERE event_id = p_event_id;
      RETURN 'duplicate';
    END IF;

    UPDATE public.stripe_webhook_events SET outcome = 'rejected'
    WHERE event_id = p_event_id;
    RETURN 'rejected_payment_identifier_reused';
  END IF;

  SELECT payments.*
  INTO existing_payment
  FROM public.payments AS payments
  WHERE payments.stripe_payment_intent_id = p_payment_intent_id;

  IF FOUND THEN
    UPDATE public.stripe_webhook_events SET outcome = 'rejected'
    WHERE event_id = p_event_id;
    RETURN 'rejected_payment_identifier_reused';
  END IF;

  SELECT listings.id, listings.seller_id, listings.selling_price, listings.status
  INTO listing_row
  FROM public.listings
  WHERE listings.id = p_listing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.stripe_webhook_events SET outcome = 'rejected'
    WHERE event_id = p_event_id;
    RETURN 'rejected_listing_missing';
  END IF;

  IF listing_row.seller_id <> p_seller_id OR p_buyer_id = listing_row.seller_id THEN
    UPDATE public.stripe_webhook_events SET outcome = 'rejected'
    WHERE event_id = p_event_id;
    RETURN 'rejected_participants';
  END IF;

  IF listing_row.status <> 'ACTIVE' THEN
    UPDATE public.stripe_webhook_events SET outcome = 'rejected'
    WHERE event_id = p_event_id;
    RETURN 'rejected_listing_not_active';
  END IF;

  IF listing_row.selling_price * 100 <> p_amount_minor OR LOWER(p_currency) <> 'usd' THEN
    UPDATE public.stripe_webhook_events SET outcome = 'rejected'
    WHERE event_id = p_event_id;
    RETURN 'rejected_amount_or_currency';
  END IF;

  UPDATE public.listings
  SET status = 'SOLD'
  WHERE id = p_listing_id AND status = 'ACTIVE';

  IF NOT FOUND THEN
    UPDATE public.stripe_webhook_events SET outcome = 'rejected'
    WHERE event_id = p_event_id;
    RETURN 'rejected_listing_not_active';
  END IF;

  INSERT INTO public.orders (
    buyer_id,
    seller_id,
    listing_id,
    amount,
    status,
    stripe_payment_intent_id,
    stripe_checkout_session_id
  )
  VALUES (
    p_buyer_id,
    p_seller_id,
    p_listing_id,
    p_amount_minor::NUMERIC / 100,
    'paid',
    p_payment_intent_id,
    p_checkout_session_id
  )
  RETURNING id INTO order_id;

  INSERT INTO public.payments (
    order_id,
    stripe_payment_intent_id,
    amount,
    currency,
    status
  )
  VALUES (
    order_id,
    p_payment_intent_id,
    p_amount_minor::NUMERIC / 100,
    LOWER(p_currency),
    'succeeded'
  );

  UPDATE public.stripe_webhook_events SET outcome = 'processed'
  WHERE event_id = p_event_id;

  RETURN 'processed';
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_stripe_checkout_purchase(
  TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, BIGINT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_stripe_checkout_purchase(
  TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, BIGINT, TEXT
) TO service_role;
