-- Orders and payments are written only by trusted server-side processing.
REVOKE ALL PRIVILEGES ON TABLE public.orders, public.payments
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.orders, public.payments TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.orders, public.payments TO service_role;

DROP POLICY IF EXISTS "Buyers and sellers can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Orders readable by buyer or listing seller" ON public.orders;
CREATE POLICY "Orders readable by buyer or listing seller"
  ON public.orders FOR SELECT TO authenticated
  USING (
    buyer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE listing.id = orders.listing_id
        AND listing.seller_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Order participants can view payments" ON public.payments;
DROP POLICY IF EXISTS "Order payments readable by participants" ON public.payments;
CREATE POLICY "Order payments readable by participants"
  ON public.payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders AS order_row
      WHERE order_row.id = payments.order_id
        AND (
          order_row.buyer_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.listings AS listing
            WHERE listing.id = order_row.listing_id
              AND listing.seller_id = (SELECT auth.uid())
          )
        )
    )
  );

-- Keep one unresolved order per one-off listing, while allowing a new order
-- after cancellation/refund. A Stripe PaymentIntent may belong to one order.
CREATE UNIQUE INDEX IF NOT EXISTS orders_one_unresolved_per_listing_idx
  ON public.orders (listing_id)
  WHERE status NOT IN ('cancelled', 'refunded');

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_payment_intent_id_idx
  ON public.orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
