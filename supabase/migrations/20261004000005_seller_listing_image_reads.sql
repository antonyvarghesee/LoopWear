-- Keep listing images private while allowing sellers to sign their own images.
-- Anonymous/public reads remain limited to active listings.
DROP POLICY IF EXISTS "Active listing image objects can be read" ON storage.objects;
CREATE POLICY "Active listing images are public and owners can read own" ON storage.objects FOR SELECT USING (
  bucket_id = 'listing-images'
  AND EXISTS (
    SELECT 1
    FROM public.listings l
    WHERE l.id::text = (storage.foldername(name))[2]
      AND l.seller_id::text = (storage.foldername(name))[1]
      AND EXISTS (
        SELECT 1 FROM public.listing_images i
        WHERE i.listing_id = l.id AND i.storage_path = storage.objects.name
      )
      AND (l.status = 'ACTIVE' OR l.seller_id = auth.uid())
  )
);
