-- Secure the favorites table created by the initial schema for Prompt 7.
ALTER TABLE public.favorites
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.favorites'::regclass
      AND conname = 'unique_user_listing_favorite'
  ) THEN
    ALTER TABLE public.favorites
      ADD CONSTRAINT unique_user_listing_favorite UNIQUE (user_id, listing_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_favorites_listing_id ON public.favorites(listing_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_created_at ON public.favorites(user_id, created_at DESC);

DROP TRIGGER IF EXISTS tr_favorites_updated_at ON public.favorites;
CREATE TRIGGER tr_favorites_updated_at
  BEFORE UPDATE ON public.favorites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON TABLE public.favorites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.favorites TO authenticated;

DROP POLICY IF EXISTS "Users can view own favorites" ON public.favorites;
DROP POLICY IF EXISTS "Users can add favorites" ON public.favorites;
DROP POLICY IF EXISTS "Users can remove favorites" ON public.favorites;
DROP POLICY IF EXISTS "favorites_select_own" ON public.favorites;
DROP POLICY IF EXISTS "favorites_insert_active_not_own" ON public.favorites;
DROP POLICY IF EXISTS "favorites_delete_own" ON public.favorites;

CREATE POLICY "favorites_select_own"
  ON public.favorites FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "favorites_insert_active_not_own"
  ON public.favorites FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.listings AS listing
      WHERE listing.id = listing_id
        AND listing.status = 'ACTIVE'
        AND listing.seller_id <> (SELECT auth.uid())
    )
  );

CREATE POLICY "favorites_delete_own"
  ON public.favorites FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- No UPDATE policy is intentionally provided: users can only add/remove rows.
