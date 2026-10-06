ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS listing_id UUID;

UPDATE public.reviews AS review
SET reviewer_id = order_row.buyer_id,
    reviewee_id = order_row.seller_id,
    listing_id = order_row.listing_id
FROM public.orders AS order_row
WHERE order_row.id = review.order_id
  AND (
    review.reviewer_id IS DISTINCT FROM order_row.buyer_id
    OR review.reviewee_id IS DISTINCT FROM order_row.seller_id
    OR review.listing_id IS DISTINCT FROM order_row.listing_id
  );

ALTER TABLE public.reviews
  ALTER COLUMN listing_id SET NOT NULL;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_listing_id_fkey
    FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE,
  ADD CONSTRAINT reviews_no_self_review_check
    CHECK (reviewer_id <> reviewee_id) NOT VALID,
  ADD CONSTRAINT reviews_comment_length_check
    CHECK (comment IS NULL OR char_length(comment) <= 1000) NOT VALID;

CREATE INDEX IF NOT EXISTS reviews_listing_created_at_idx
  ON public.reviews (listing_id, created_at DESC);

CREATE INDEX IF NOT EXISTS reviews_reviewee_created_at_idx
  ON public.reviews (reviewee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS reviews_reviewer_created_at_idx
  ON public.reviews (reviewer_id, created_at DESC);

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
    AND purchase.status IN ('paid', 'shipped', 'delivered')
    AND purchase.buyer_id = auth.uid()
    AND purchase.buyer_id <> purchase.seller_id
  FOR SHARE OF purchase, listing, payment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'review requires a completed purchase by the authenticated buyer'
      USING ERRCODE = '42501';
  END IF;

  NEW.reviewer_id := order_row.buyer_id;
  NEW.reviewee_id := order_row.seller_id;
  NEW.listing_id := order_row.listing_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_purchase_review() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_reviews_prepare_purchase_review ON public.reviews;
CREATE TRIGGER tr_reviews_prepare_purchase_review
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.prepare_purchase_review();

DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.reviews;
DROP POLICY IF EXISTS "Order buyers can leave reviews" ON public.reviews;
DROP POLICY IF EXISTS "Buyers can read own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Buyers can create reviews for completed purchases" ON public.reviews;

CREATE POLICY "Buyers can read own reviews"
  ON public.reviews FOR SELECT TO authenticated
  USING (reviewer_id = (SELECT auth.uid()));

CREATE POLICY "Buyers can create reviews for completed purchases"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = (SELECT auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE public.reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.reviews TO authenticated;
GRANT INSERT (order_id, rating, comment) ON TABLE public.reviews TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_seller_reviews(
  p_username TEXT,
  p_listing_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  listing_id UUID,
  rating INTEGER,
  comment TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT review.listing_id, review.rating, LEFT(review.comment, 1000), review.created_at
  FROM public.reviews AS review
  JOIN public.orders AS purchase
    ON purchase.id = review.order_id
   AND purchase.buyer_id = review.reviewer_id
   AND purchase.seller_id = review.reviewee_id
   AND purchase.listing_id = review.listing_id
   AND purchase.status IN ('paid', 'shipped', 'delivered')
  JOIN public.listings AS listing
    ON listing.id = review.listing_id
   AND listing.seller_id = review.reviewee_id
  JOIN public.profiles AS seller
    ON seller.id = review.reviewee_id
  JOIN public.payments AS payment
    ON payment.order_id = purchase.id
   AND payment.status = 'succeeded'
   AND payment.amount = purchase.amount
  WHERE p_username IS NOT NULL
    AND p_username ~ '^[A-Za-z0-9_]{3,20}$'
    AND seller.username = p_username
    AND review.reviewer_id <> review.reviewee_id
    AND (p_listing_id IS NULL OR review.listing_id = p_listing_id)
    AND p_limit BETWEEN 1 AND 50
    AND p_offset BETWEEN 0 AND 10000
  ORDER BY review.created_at DESC, review.id
  LIMIT p_limit
  OFFSET p_offset;
$$;

REVOKE ALL ON FUNCTION public.get_public_seller_reviews(TEXT, UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_seller_reviews(TEXT, UUID, INTEGER, INTEGER)
  TO anon, authenticated;
