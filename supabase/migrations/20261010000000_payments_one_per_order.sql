DO $$
BEGIN
  IF EXISTS (
    SELECT payments.order_id
    FROM public.payments AS payments
    GROUP BY payments.order_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one payment per order: duplicate payment order_ids exist'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_per_order_idx
  ON public.payments (order_id);
