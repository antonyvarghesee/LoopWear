import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { escapePostgrestSearch, type BrowseFilters } from "@/lib/validations/browse";
import type { ListingBrand, ListingCategory, ListingRecord } from "@/types/listing-management";
import { getActiveListingPrimaryImageUrls } from "@/services/listing-images";
import { getPublicSellerProfilesForListings } from "@/services/seller-profiles";

const BROWSE_COLUMNS = "id,seller_id,title,slug,description,category_id,brand_id,gender,size,condition,color,material,original_price,selling_price,location,status,created_at,updated_at,categories!listings_category_id_fkey(name,slug),brands!listings_brand_id_fkey(name,slug)";

export async function getBrowseOptions(): Promise<{ categories: ListingCategory[]; brands: ListingBrand[] }> {
  if (!isSupabaseConfigured()) throw new Error("Browse options are unavailable.");
  const supabase = await createSupabaseServerClient();
  const [categories, brands] = await Promise.all([
    supabase.from("categories").select("id,name,slug").order("name"),
    supabase.from("brands").select("id,name,slug").order("name"),
  ]);
  if (categories.error || brands.error) {
    console.error("Unable to load browse catalogs:", categories.error ?? brands.error);
    throw new Error("Browse options are temporarily unavailable.");
  }
  return { categories: (categories.data ?? []) as ListingCategory[], brands: (brands.data ?? []) as ListingBrand[] };
}

export async function searchActiveListings(filters: BrowseFilters, options: { categories: ListingCategory[]; brands: ListingBrand[] }) {
  if (!isSupabaseConfigured()) throw new Error("Listings are unavailable.");
  const supabase = await createSupabaseServerClient();
  const pageSize = 12;
  const query = supabase.from("listings").select(BROWSE_COLUMNS, { count: "exact" }).eq("status", "ACTIVE");
  if (filters.q) {
    const term = escapePostgrestSearch(filters.q);
    query.or(["title", "description", "color", "material", "location"].map((column) => `${column}.ilike.${term}`).join(","));
  }
  const category = options.categories.find((item) => item.slug === filters.category);
  const brand = options.brands.find((item) => item.slug === filters.brand);
  if (category) query.eq("category_id", category.id);
  if (brand) query.eq("brand_id", brand.id);
  if (filters.gender) query.eq("gender", filters.gender);
  if (filters.condition) query.eq("condition", filters.condition);
  if (filters.color) query.ilike("color", `%${filters.color.replace(/[\\%_]/g, "\\$&")}%`);
  if (filters.material) query.ilike("material", `%${filters.material.replace(/[\\%_]/g, "\\$&")}%`);
  if (filters.location) query.ilike("location", `%${filters.location.replace(/[\\%_]/g, "\\$&")}%`);
  if (filters.minPrice !== undefined) query.gte("selling_price", filters.minPrice);
  if (filters.maxPrice !== undefined) query.lte("selling_price", filters.maxPrice);
  if (filters.sort === "price_asc") query.order("selling_price", { ascending: true }).order("created_at", { ascending: false });
  else if (filters.sort === "price_desc") query.order("selling_price", { ascending: false }).order("created_at", { ascending: false });
  else query.order("created_at", { ascending: false });
  const from = (filters.page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) {
    console.error("Browse query failed:", error);
    throw new Error("Listings are temporarily unavailable.");
  }
  const listings = (data ?? []) as unknown as ListingRecord[];
  let images: Record<string, string> = {};
  let sellers = new Map<string, NonNullable<ListingRecord["profiles"]>>();
  if (listings.length) {
    [images, sellers] = await Promise.all([
      getActiveListingPrimaryImageUrls(listings.map((listing) => listing.id)),
      getPublicSellerProfilesForListings(listings.map((listing) => listing.id)),
    ]);
  }
  return { listings: listings.map((listing) => ({ ...listing, profiles: sellers.get(listing.id) ?? null, primaryImageUrl: images[listing.id] ?? null })), total: count ?? 0, pageSize };
}
