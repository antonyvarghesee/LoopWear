CREATE OR REPLACE FUNCTION public.mark_order_shipped(p_order_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  actor_id UUID := auth.uid();
  order_listing_id UUID;
  seller_moderation_state TEXT;
  updated_order_id UUID;
  shipment_time TIMESTAMPTZ := CURRENT_TIMESTAMP;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication required to ship an order'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.profiles
  WHERE id = actor_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller is not authorized to ship this order'
      USING ERRCODE = '42501';
  END IF;

  SELECT order_row.listing_id
  INTO order_listing_id
  FROM public.orders AS order_row
  WHERE order_row.id = p_order_id
    AND order_row.seller_id = actor_id
    AND order_row.buyer_id <> actor_id
    AND order_row.status = 'paid'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order is not available to ship'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.listings AS listing
  WHERE listing.id = order_listing_id
    AND listing.seller_id = actor_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order is not available to ship'
      USING ERRCODE = '22023';
  END IF;

  SELECT moderation.moderation_state
  INTO seller_moderation_state
  FROM public.user_moderation AS moderation
  WHERE moderation.user_id = actor_id;
  IF COALESCE(seller_moderation_state, 'normal') <> 'normal' THEN
    RAISE EXCEPTION 'seller is not authorized to ship orders'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders AS order_row
  SET status = 'shipped',
      updated_at = shipment_time
  WHERE order_row.id = p_order_id
    AND order_row.seller_id = actor_id
    AND order_row.buyer_id <> actor_id
    AND order_row.status = 'paid'
    AND EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE listing.id = order_row.listing_id
        AND listing.seller_id = actor_id
    )
  RETURNING order_row.id INTO updated_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order is not available to ship'
      USING ERRCODE = '22023';
  END IF;

  RETURN updated_order_id;
END;
$$;

ALTER FUNCTION public.mark_order_shipped(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_order_shipped(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_order_shipped(UUID)
  TO authenticated;
