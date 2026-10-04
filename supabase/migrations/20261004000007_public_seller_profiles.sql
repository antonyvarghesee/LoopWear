-- Public seller data is exposed through a narrow projection, not the full
-- profiles row (whose id is the auth.users UUID and whose updated_at is system data).
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by anonymous users" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Public profiles are viewable by anonymous users"
  ON public.profiles FOR SELECT TO anon USING (true);
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id);

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (username, full_name, bio, location) ON TABLE public.profiles TO authenticated;

CREATE OR REPLACE VIEW public.seller_profiles
WITH (security_barrier = true)
AS
  SELECT username, full_name, avatar_url, bio, location,
         rating, review_count, is_verified, created_at
  FROM public.profiles;

REVOKE ALL ON TABLE public.seller_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.seller_profiles TO anon, authenticated;

-- Map public ACTIVE listing IDs to public seller details without returning
-- seller/profile IDs. Input IDs already identify public listings.
CREATE OR REPLACE FUNCTION public.get_public_seller_profiles_for_listings(p_listing_ids UUID[])
RETURNS TABLE (
  listing_id UUID,
  username TEXT,
  full_name TEXT,
  avatar_url TEXT,
  rating NUMERIC,
  review_count INTEGER,
  is_verified BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT listing.id, profile.username, profile.full_name, profile.avatar_url,
         profile.rating, profile.review_count, profile.is_verified
  FROM public.listings AS listing
  JOIN public.profiles AS profile ON profile.id = listing.seller_id
  WHERE p_listing_ids IS NOT NULL
    AND cardinality(p_listing_ids) BETWEEN 1 AND 24
    AND listing.id = ANY(p_listing_ids)
    AND listing.status = 'ACTIVE';
$$;

REVOKE ALL ON FUNCTION public.get_public_seller_profiles_for_listings(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_seller_profiles_for_listings(UUID[]) TO anon, authenticated;

-- Return one bounded page and an exact active-listing count for a public
-- username. The JSON projection excludes seller_id and profile/auth IDs.
CREATE OR REPLACE FUNCTION public.get_seller_active_listings(p_username TEXT, p_page INTEGER)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH seller AS (
    SELECT profile.id, profile.username, profile.full_name, profile.avatar_url,
           profile.rating, profile.review_count, profile.is_verified
    FROM public.profiles AS profile
    WHERE profile.username = p_username
      AND p_username ~ '^[A-Za-z0-9_]{3,20}$'
      AND p_page BETWEEN 1 AND 100000
  ), active_listings AS (
    SELECT listing.id, listing.title, listing.slug, listing.description,
           listing.category_id, listing.brand_id, listing.gender, listing.size,
           listing.condition, listing.color, listing.material,
           listing.original_price, listing.selling_price, listing.location,
           listing.status, listing.created_at, listing.updated_at,
           category.name AS category_name, category.slug AS category_slug,
           brand.name AS brand_name, brand.slug AS brand_slug,
           seller.username AS seller_username, seller.full_name AS seller_full_name,
           seller.avatar_url AS seller_avatar_url, seller.rating AS seller_rating,
           seller.review_count AS seller_review_count, seller.is_verified AS seller_is_verified
    FROM public.listings AS listing
    JOIN seller ON seller.id = listing.seller_id
    LEFT JOIN public.categories AS category ON category.id = listing.category_id
    LEFT JOIN public.brands AS brand ON brand.id = listing.brand_id
    WHERE listing.status = 'ACTIVE'
  ), counted AS (
    SELECT count(*)::INTEGER AS total FROM active_listings
  ), page_rows AS (
    SELECT * FROM active_listings
    ORDER BY created_at DESC, id
    LIMIT 12 OFFSET ((p_page - 1) * 12)
  )
  SELECT jsonb_build_object(
    'total', counted.total,
    'listings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', page_item.id,
        'title', page_item.title,
        'slug', page_item.slug,
        'description', page_item.description,
        'category_id', page_item.category_id,
        'brand_id', page_item.brand_id,
        'gender', page_item.gender,
        'size', page_item.size,
        'condition', page_item.condition,
        'color', page_item.color,
        'material', page_item.material,
        'original_price', page_item.original_price,
        'selling_price', page_item.selling_price,
        'location', page_item.location,
        'status', page_item.status,
        'created_at', page_item.created_at,
        'updated_at', page_item.updated_at,
        'categories', CASE WHEN page_item.category_name IS NULL THEN NULL ELSE jsonb_build_object('name', page_item.category_name, 'slug', page_item.category_slug) END,
        'brands', CASE WHEN page_item.brand_name IS NULL THEN NULL ELSE jsonb_build_object('name', page_item.brand_name, 'slug', page_item.brand_slug) END,
        'profiles', jsonb_build_object(
          'username', page_item.seller_username,
          'full_name', page_item.seller_full_name,
          'avatar_url', page_item.seller_avatar_url,
          'rating', page_item.seller_rating,
          'review_count', page_item.seller_review_count,
          'is_verified', page_item.seller_is_verified
        )
      ) ORDER BY page_item.created_at DESC, page_item.id)
      FROM page_rows AS page_item
    ), '[]'::JSONB)
  )
  FROM counted;
$$;

REVOKE ALL ON FUNCTION public.get_seller_active_listings(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_active_listings(TEXT, INTEGER) TO anon, authenticated;
