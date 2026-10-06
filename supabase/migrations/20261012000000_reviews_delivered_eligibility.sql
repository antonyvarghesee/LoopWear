CREATE OR REPLACE FUNCTION public.prepare_purchase_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  order_row RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required to create a review'
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
    AND purchase.buyer_id = auth.uid()
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
