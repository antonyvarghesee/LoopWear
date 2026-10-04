-- Adapt the foundation listing table in place; do not edit the applied base migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'selling_price'
  ) THEN
    ALTER TABLE public.listings RENAME COLUMN price TO selling_price;
  END IF;
END;
$$;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'Unisex',
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS material TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE public.listings ALTER COLUMN seller_id SET DEFAULT auth.uid();
ALTER TABLE public.listings ALTER COLUMN status SET DEFAULT 'DRAFT';

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_price_check;
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_selling_price_check;
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_original_price_check;
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_status_check;

-- Preserve existing rows while moving the previous lowercase status vocabulary
-- to the requested lifecycle. Legacy reserved items need seller review before
-- they become public again, so they enter DRAFT instead of being auto-published.
UPDATE public.listings
SET status = CASE LOWER(status)
  WHEN 'draft' THEN 'DRAFT'
  WHEN 'active' THEN 'ACTIVE'
  WHEN 'reserved' THEN 'DRAFT'
  WHEN 'sold' THEN 'SOLD'
  WHEN 'archived' THEN 'ARCHIVED'
  WHEN 'removed' THEN 'REMOVED'
  ELSE 'DRAFT'
END;
UPDATE public.listings SET status = 'DRAFT' WHERE selling_price <= 0;

DO $$
DECLARE
  listing RECORD;
  base_slug TEXT;
  candidate TEXT;
  suffix INTEGER;
BEGIN
  FOR listing IN SELECT id, title FROM public.listings WHERE slug IS NULL ORDER BY created_at, id LOOP
    base_slug := TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(listing.title), '[^a-z0-9]+', '-', 'g'));
    IF base_slug = '' THEN base_slug := 'listing'; END IF;
    base_slug := RTRIM(LEFT(base_slug, 140), '-');
    candidate := base_slug;
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM public.listings WHERE slug = candidate AND id <> listing.id) LOOP
      candidate := RTRIM(LEFT(base_slug, 135), '-') || '-' || suffix::TEXT;
      suffix := suffix + 1;
    END LOOP;
    UPDATE public.listings SET slug = candidate WHERE id = listing.id;
  END LOOP;
END;
$$;

ALTER TABLE public.listings ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_slug_key UNIQUE (slug),
  ADD CONSTRAINT listings_selling_price_positive CHECK (selling_price > 0) NOT VALID,
  ADD CONSTRAINT listings_original_price_positive CHECK (original_price IS NULL OR original_price > 0) NOT VALID,
  ADD CONSTRAINT listings_original_price_gte_selling CHECK (original_price IS NULL OR original_price >= selling_price) NOT VALID,
  ADD CONSTRAINT listings_gender_check CHECK (gender IN ('Women', 'Men', 'Unisex', 'Kids')),
  ADD CONSTRAINT listings_status_check CHECK (status IN ('DRAFT', 'ACTIVE', 'SOLD', 'ARCHIVED', 'REMOVED')),
  ADD CONSTRAINT listings_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT listings_title_length CHECK (char_length(btrim(title)) BETWEEN 5 AND 120) NOT VALID,
  ADD CONSTRAINT listings_description_length CHECK (char_length(btrim(description)) BETWEEN 20 AND 5000) NOT VALID,
  ADD CONSTRAINT listings_category_required CHECK (category_id IS NOT NULL) NOT VALID,
  ADD CONSTRAINT listings_size_length CHECK (char_length(btrim(size)) BETWEEN 1 AND 32) NOT VALID,
  ADD CONSTRAINT listings_color_length CHECK (color IS NULL OR char_length(color) <= 60) NOT VALID,
  ADD CONSTRAINT listings_material_length CHECK (material IS NULL OR char_length(material) <= 100) NOT VALID,
  ADD CONSTRAINT listings_location_length CHECK (location IS NULL OR char_length(location) <= 120) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_listings_seller_status_created
  ON public.listings (seller_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_active_category
  ON public.listings (category_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_listings_active_brand
  ON public.listings (brand_id) WHERE status = 'ACTIVE';

-- Seed the shared database catalog. Conflicts are left intact so operators can
-- customize names and descriptions without this migration overwriting them.
INSERT INTO public.categories (name, slug, description) VALUES
  ('T-Shirts', 't-shirts', 'Everyday tees, graphic shirts, and wardrobe basics.'),
  ('Shirts', 'shirts', 'Casual and formal shirts in a range of styles.'),
  ('Jeans', 'jeans', 'Denim in classic and contemporary cuts.'),
  ('Trousers', 'trousers', 'Tailored trousers, chinos, and relaxed pants.'),
  ('Jackets', 'jackets', 'Light layers, coats, and statement outerwear.'),
  ('Dresses', 'dresses', 'Day dresses, occasionwear, and timeless pieces.'),
  ('Skirts', 'skirts', 'Mini, midi, and maxi skirts.'),
  ('Sweaters', 'sweaters', 'Knits, cardigans, and cozy layers.'),
  ('Hoodies', 'hoodies', 'Comfortable hoodies and sweatshirts.'),
  ('Activewear', 'activewear', 'Performance clothing and studio essentials.'),
  ('Footwear', 'footwear', 'Shoes, boots, and sneakers.'),
  ('Accessories', 'accessories', 'Bags, belts, hats, and finishing touches.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.brands (name, slug) VALUES
  ('Levi''s', 'levis'), ('Nike', 'nike'), ('Adidas', 'adidas'),
  ('Zara', 'zara'), ('H&M', 'h-and-m'), ('Uniqlo', 'uniqlo'),
  ('Gap', 'gap'), ('Patagonia', 'patagonia'), ('The North Face', 'the-north-face'),
  ('Columbia', 'columbia'), ('Carhartt', 'carhartt'), ('Wrangler', 'wrangler'),
  ('Lee', 'lee'), ('Ralph Lauren', 'ralph-lauren'), ('Tommy Hilfiger', 'tommy-hilfiger'),
  ('Calvin Klein', 'calvin-klein'), ('Champion', 'champion'), ('Converse', 'converse'),
  ('Vans', 'vans'), ('New Balance', 'new-balance'), ('Reebok', 'reebok'),
  ('Puma', 'puma'), ('Lululemon', 'lululemon'), ('Mango', 'mango'),
  ('COS', 'cos'), ('ASOS', 'asos'), ('Urban Outfitters', 'urban-outfitters'),
  ('Free People', 'free-people'), ('Dickies', 'dickies'), ('Dr. Martens', 'dr-martens')
ON CONFLICT (slug) DO NOTHING;

-- Slugs are always derived from the title in PostgreSQL. Advisory locking plus
-- the unique constraint makes concurrent inserts for the same title safe.
CREATE OR REPLACE FUNCTION public.prepare_listing_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix INTEGER := 2;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL OR NEW.seller_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'listing seller must match the authenticated user' USING ERRCODE = '42501';
    END IF;
    NEW.status := 'DRAFT';
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.seller_id IS DISTINCT FROM OLD.seller_id OR NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'listing identity fields cannot be changed' USING ERRCODE = '42501';
    END IF;
    IF OLD.status IN ('SOLD', 'REMOVED') THEN
      RAISE EXCEPTION 'listing is no longer editable' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'DRAFT' AND NEW.status IN ('ACTIVE', 'ARCHIVED', 'REMOVED')) OR
      (OLD.status = 'ACTIVE' AND NEW.status IN ('ARCHIVED', 'REMOVED')) OR
      (OLD.status = 'ARCHIVED' AND NEW.status = 'REMOVED') OR
      (OLD.status = 'ACTIVE' AND NEW.status = 'SOLD' AND auth.uid() IS NULL)
    ) THEN
      RAISE EXCEPTION 'invalid listing status transition' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  base_slug := TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(NEW.title), '[^a-z0-9]+', '-', 'g'));
  IF base_slug = '' THEN base_slug := 'listing'; END IF;
  base_slug := RTRIM(LEFT(base_slug, 140), '-');
  PERFORM pg_advisory_xact_lock(HASHTEXTEXTENDED(base_slug, 0));
  candidate := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.listings WHERE slug = candidate) LOOP
    candidate := RTRIM(LEFT(base_slug, 135), '-') || '-' || suffix::TEXT;
    suffix := suffix + 1;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_listing_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_listings_prepare_write ON public.listings;
CREATE TRIGGER tr_listings_prepare_write
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.prepare_listing_write();

-- Revoke broad default table grants and grant only the columns needed by the
-- authenticated server service. Seller ID, slug and delete remain database controlled.
REVOKE INSERT, UPDATE, DELETE ON public.listings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.listings TO anon, authenticated;
GRANT INSERT (title, description, category_id, brand_id, gender, size, condition, color, material, original_price, selling_price, location, slug)
  ON public.listings TO authenticated;
GRANT UPDATE (title, description, category_id, brand_id, gender, size, condition, color, material, original_price, selling_price, location, status)
  ON public.listings TO authenticated;
GRANT SELECT ON public.categories, public.brands TO anon, authenticated;

DROP POLICY IF EXISTS "Listings viewable by everyone" ON public.listings;
DROP POLICY IF EXISTS "Sellers can create listings" ON public.listings;
DROP POLICY IF EXISTS "Sellers can update own listings" ON public.listings;
DROP POLICY IF EXISTS "Sellers can delete own listings" ON public.listings;

CREATE POLICY "Active listings are public and sellers can view their own"
  ON public.listings FOR SELECT USING (status = 'ACTIVE' OR seller_id = auth.uid());
CREATE POLICY "Authenticated sellers can create their own drafts"
  ON public.listings FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = seller_id AND status = 'DRAFT');
CREATE POLICY "Sellers can update their own listings"
  ON public.listings FOR UPDATE
  USING (auth.uid() IS NOT NULL AND auth.uid() = seller_id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = seller_id);
