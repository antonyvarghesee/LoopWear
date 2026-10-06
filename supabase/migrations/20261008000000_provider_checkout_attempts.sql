CREATE TABLE public.provider_checkout_attempts (
  payment_provider TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL,
  listing_id UUID NOT NULL,
  buyer_id UUID NOT NULL,
  seller_id UUID NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  productinfo TEXT NOT NULL,
  firstname TEXT NOT NULL,
  email TEXT NOT NULL,
  response_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (response_state IN ('pending', 'verified_success', 'verified_failure', 'verified_cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  PRIMARY KEY (payment_provider, provider_transaction_id)
);

ALTER TABLE public.provider_checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.provider_checkout_attempts
  FROM PUBLIC, anon, authenticated, service_role;

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
    RAISE EXCEPTION 'listing is not available for checkout' USING ERRCODE = '22023';
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
    AND attempts.expires_at > NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_provider_checkout_attempt(
  p_payment_provider TEXT,
  p_provider_transaction_id TEXT,
  p_response_state TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  consumed_transaction_id TEXT;
  current_state TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'checkout attempt consumption requires service role' USING ERRCODE = '42501';
  END IF;

  IF p_response_state NOT IN ('verified_success', 'verified_failure', 'verified_cancelled') THEN
    RAISE EXCEPTION 'invalid verified response state' USING ERRCODE = '22023';
  END IF;

  UPDATE public.provider_checkout_attempts
  SET response_state = p_response_state
  WHERE payment_provider = LOWER(BTRIM(p_payment_provider))
    AND provider_transaction_id = p_provider_transaction_id
    AND response_state = 'pending'
    AND expires_at > NOW()
  RETURNING provider_transaction_id INTO consumed_transaction_id;

  IF consumed_transaction_id IS NOT NULL THEN
    RETURN 'consumed';
  END IF;

  SELECT attempts.response_state INTO current_state
  FROM public.provider_checkout_attempts AS attempts
  WHERE attempts.payment_provider = LOWER(BTRIM(p_payment_provider))
    AND attempts.provider_transaction_id = p_provider_transaction_id;

  IF current_state IS NOT NULL AND current_state <> 'pending' THEN
    RETURN 'duplicate';
  END IF;

  RETURN 'invalid';
END;
$$;

REVOKE ALL ON FUNCTION public.register_provider_checkout_attempt(
  TEXT, TEXT, UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_provider_checkout_attempt(
  TEXT, TEXT, UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.get_provider_checkout_attempt(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_checkout_attempt(TEXT, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.consume_provider_checkout_attempt(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_provider_checkout_attempt(TEXT, TEXT, TEXT)
  TO service_role;
