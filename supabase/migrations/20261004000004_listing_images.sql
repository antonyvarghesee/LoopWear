-- Secure listing image metadata and private object access.
ALTER TABLE public.listing_images
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

UPDATE public.listing_images
SET sort_order = COALESCE(display_order, 0)
WHERE sort_order IS NULL;
WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY listing_id ORDER BY COALESCE(display_order, 0), created_at, id) - 1 AS position
  FROM public.listing_images
)
UPDATE public.listing_images AS images SET sort_order = ordered.position
FROM ordered WHERE images.id = ordered.id;

ALTER TABLE public.listing_images ALTER COLUMN sort_order SET DEFAULT 0;
ALTER TABLE public.listing_images ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE public.listing_images ALTER COLUMN image_url DROP NOT NULL;
ALTER TABLE public.listing_images
  ADD CONSTRAINT listing_images_sort_order_nonnegative CHECK (sort_order >= 0),
  ADD CONSTRAINT listing_images_storage_path_nonempty CHECK (storage_path IS NULL OR storage_path <> '');

CREATE UNIQUE INDEX IF NOT EXISTS listing_images_storage_path_key ON public.listing_images(storage_path);
ALTER TABLE public.listing_images DROP CONSTRAINT IF EXISTS listing_images_listing_id_sort_order_key;
DROP INDEX IF EXISTS public.listing_images_listing_sort_order_key;
ALTER TABLE public.listing_images ADD CONSTRAINT listing_images_listing_sort_order_key UNIQUE (listing_id, sort_order) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX IF NOT EXISTS idx_listing_images_listing_order ON public.listing_images(listing_id, sort_order);

DROP POLICY IF EXISTS "Listing images viewable by everyone" ON public.listing_images;
DROP POLICY IF EXISTS "Sellers can add images to own listings" ON public.listing_images;
DROP POLICY IF EXISTS "Sellers can delete images of own listings" ON public.listing_images;
CREATE POLICY "Active listing images are public; sellers can view own" ON public.listing_images FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND (l.status = 'ACTIVE' OR l.seller_id = auth.uid()))
);
CREATE POLICY "Sellers can add images to editable own listings" ON public.listing_images FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = auth.uid() AND l.status IN ('DRAFT', 'ACTIVE', 'ARCHIVED'))
);
CREATE POLICY "Sellers can delete images of editable own listings" ON public.listing_images FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = auth.uid() AND l.status IN ('DRAFT', 'ACTIVE', 'ARCHIVED'))
);
CREATE POLICY "Sellers can reorder images of editable own listings" ON public.listing_images FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = auth.uid() AND l.status IN ('DRAFT', 'ACTIVE', 'ARCHIVED'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = auth.uid() AND l.status IN ('DRAFT', 'ACTIVE', 'ARCHIVED'))
);
-- A seller may only change ordering. Keep listing_id and storage_path immutable
-- so an authenticated metadata write cannot point a row at another seller's object.
REVOKE UPDATE ON public.listing_images FROM authenticated;
GRANT UPDATE (sort_order) ON public.listing_images TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_listing_image_path()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE expected_seller UUID;
BEGIN
  SELECT seller_id INTO expected_seller FROM public.listings WHERE id = NEW.listing_id;
  IF expected_seller IS NULL OR NEW.storage_path IS NULL OR NEW.storage_path !~ ('^' || expected_seller::text || '/' || NEW.listing_id::text || '/[0-9a-fA-F-]{36}[.](jpg|png|webp)$') THEN
    RAISE EXCEPTION 'Invalid listing image path' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS listing_images_validate_path_before_write ON public.listing_images;
CREATE TRIGGER listing_images_validate_path_before_write BEFORE INSERT OR UPDATE OF listing_id, storage_path ON public.listing_images FOR EACH ROW EXECUTE FUNCTION public.validate_listing_image_path();

-- Public buckets bypass object SELECT policies. Make listing images private so
-- only active listing objects can be signed/read through authenticated policy.
UPDATE storage.buckets SET public = false WHERE id = 'listing-images';
DROP POLICY IF EXISTS "Public read for listing images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload listing images" ON storage.objects;
DROP POLICY IF EXISTS "Listing image objects can be read publicly" ON storage.objects;
DROP POLICY IF EXISTS "Listing image owners can upload" ON storage.objects;
DROP POLICY IF EXISTS "Listing image owners can delete" ON storage.objects;
CREATE POLICY "Active listing image objects can be read" ON storage.objects FOR SELECT USING (
  bucket_id = 'listing-images' AND EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id::text = (storage.foldername(name))[2]
      AND l.seller_id::text = (storage.foldername(name))[1]
      AND l.status = 'ACTIVE'
      AND EXISTS (SELECT 1 FROM public.listing_images i WHERE i.listing_id = l.id AND i.storage_path = storage.objects.name)
  )
);
CREATE POLICY "Listing image owners can upload" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'listing-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id::text = (storage.foldername(name))[2]
      AND l.seller_id = auth.uid() AND l.status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')
  )
);
CREATE POLICY "Listing image owners can delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'listing-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id::text = (storage.foldername(name))[2]
      AND l.seller_id = auth.uid() AND l.status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')
  )
);
-- Keep the pre-existing public avatar bucket behavior while narrowing listing
-- image access to the listing-specific policies above.
CREATE POLICY "Public avatar reads" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Authenticated avatar uploads" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.enforce_listing_image_limit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.listings WHERE id = NEW.listing_id FOR UPDATE;
  IF (SELECT count(*) FROM public.listing_images WHERE listing_id = NEW.listing_id) >= 8 THEN
    RAISE EXCEPTION 'A listing can have at most 8 images' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS listing_images_limit_before_insert ON public.listing_images;
CREATE TRIGGER listing_images_limit_before_insert BEFORE INSERT ON public.listing_images FOR EACH ROW EXECUTE FUNCTION public.enforce_listing_image_limit();
