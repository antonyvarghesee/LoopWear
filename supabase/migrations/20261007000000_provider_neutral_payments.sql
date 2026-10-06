DROP FUNCTION IF EXISTS public.confirm_stripe_checkout_purchase(
  TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, BIGINT, TEXT
);
DROP TABLE IF EXISTS public.stripe_webhook_events;
DROP INDEX IF EXISTS public.orders_stripe_checkout_session_id_idx;
DROP INDEX IF EXISTS public.orders_stripe_payment_intent_id_idx;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_checkout_id TEXT;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;

UPDATE public.orders
SET payment_provider = 'stripe',
    provider_payment_id = stripe_payment_intent_id
WHERE stripe_payment_intent_id IS NOT NULL;

UPDATE public.orders
SET provider_checkout_id = stripe_checkout_session_id
WHERE stripe_checkout_session_id IS NOT NULL;

UPDATE public.payments
SET payment_provider = 'stripe',
    provider_payment_id = stripe_payment_intent_id
WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS stripe_payment_intent_id,
  DROP COLUMN IF EXISTS stripe_checkout_session_id;

ALTER TABLE public.payments
  DROP COLUMN IF EXISTS stripe_payment_intent_id;

CREATE UNIQUE INDEX IF NOT EXISTS orders_provider_payment_id_idx
  ON public.orders (payment_provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_provider_checkout_id_idx
  ON public.orders (payment_provider, provider_checkout_id)
  WHERE provider_checkout_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_idx
  ON public.payments (payment_provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE TABLE public.payment_webhook_events (
  payment_provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_checkout_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('processing', 'processed', 'duplicate', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (payment_provider, event_id)
);

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.payment_webhook_events
  FROM PUBLIC, anon, authenticated, service_role;

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
  listing_row RECORD;
  existing_order RECORD;
  existing_payment RECORD;
  order_id UUID;
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
    OR p_currency IS NULL OR LOWER(p_currency) <> 'usd'
  THEN
    RAISE EXCEPTION 'invalid verified payment details' USING ERRCODE = '22023';
  END IF;

  p_payment_provider := LOWER(BTRIM(p_payment_provider));
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_payment_provider || ':' || p_provider_payment_id, 0)
  );

  INSERT INTO public.payment_webhook_events (
    payment_provider, event_id, event_type, provider_checkout_id, outcome
  )
  VALUES (
    p_payment_provider, p_event_id, p_event_type, p_provider_checkout_id, 'processing'
  )
  ON CONFLICT (payment_provider, event_id) DO NOTHING
  RETURNING event_id INTO inserted_event_id;

  IF inserted_event_id IS NULL THEN
    RETURN 'duplicate';
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
      AND payments.status = 'succeeded';

    IF FOUND
      AND existing_order.provider_checkout_id = p_provider_checkout_id
      AND existing_order.provider_payment_id = p_provider_payment_id
      AND existing_order.listing_id = p_listing_id
      AND existing_order.buyer_id = p_buyer_id
      AND existing_order.seller_id = p_seller_id
      AND existing_order.status = 'paid'
    THEN
      UPDATE public.payment_webhook_events SET outcome = 'duplicate'
      WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
      RETURN 'duplicate';
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
    UPDATE public.payment_webhook_events SET outcome = 'rejected'
    WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
    RETURN 'rejected_listing_missing';
  END IF;

  IF listing_row.seller_id <> p_seller_id OR p_buyer_id = listing_row.seller_id THEN
    UPDATE public.payment_webhook_events SET outcome = 'rejected'
    WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
    RETURN 'rejected_participants';
  END IF;

  IF listing_row.status <> 'ACTIVE' THEN
    UPDATE public.payment_webhook_events SET outcome = 'rejected'
    WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
    RETURN 'rejected_listing_not_active';
  END IF;

  IF listing_row.selling_price * 100 <> p_amount_minor OR LOWER(p_currency) <> 'usd' THEN
    UPDATE public.payment_webhook_events SET outcome = 'rejected'
    WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
    RETURN 'rejected_amount_or_currency';
  END IF;

  UPDATE public.listings
  SET status = 'SOLD'
  WHERE id = p_listing_id AND status = 'ACTIVE';

  IF NOT FOUND THEN
    UPDATE public.payment_webhook_events SET outcome = 'rejected'
    WHERE payment_provider = p_payment_provider AND event_id = p_event_id;
    RETURN 'rejected_listing_not_active';
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

  UPDATE public.payment_webhook_events SET outcome = 'processed'
  WHERE payment_provider = p_payment_provider AND event_id = p_event_id;

  RETURN 'processed';
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_provider_purchase(
  TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, BIGINT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_provider_purchase(
  TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, BIGINT, TEXT
) TO service_role;
