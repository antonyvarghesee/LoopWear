CREATE OR REPLACE FUNCTION public.confirm_order_delivery(p_order_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  updated_order_id UUID;
  confirmation_time TIMESTAMPTZ := CURRENT_TIMESTAMP;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required to confirm delivery'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders
  SET status = 'delivered',
      delivered_at = confirmation_time,
      delivered_by = auth.uid(),
      updated_at = confirmation_time
  WHERE id = p_order_id
    AND buyer_id = auth.uid()
    AND seller_id <> auth.uid()
    AND status = 'shipped'
  RETURNING id INTO updated_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order is not available for delivery confirmation'
      USING ERRCODE = '22023';
  END IF;

  RETURN updated_order_id;
END;
$$;
