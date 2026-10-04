import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { favoriteListingIdSchema } from "@/lib/validations/favorites";
import { getCurrentUser } from "@/services/auth";
import { getActiveListingPrimaryImageUrls } from "@/services/listing-images";
import { getPublicSellerProfilesForListings } from "@/services/seller-profiles";
import type { ListingRecord } from "@/types/listing-management";

const FAVORITE_LISTING_COLUMNS = "id,seller_id,title,slug,description,category_id,brand_id,gender,size,condition,color,material,original_price,selling_price,location,status,created_at,updated_at,categories!listings_category_id_fkey(name,slug),brands!listings_brand_id_fkey(name,slug)";

async function authenticatedContext() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!isSupabaseConfigured()) throw new Error("Favorites are temporarily unavailable.");
  return { user, supabase: await createSupabaseServerClient() };
}

export async function addFavorite(listingId: unknown) {
  const parsed = favoriteListingIdSchema.safeParse(listingId);
  if (!parsed.success) return { success: false as const, error: "This listing could not be found." };
  const context = await authenticatedContext();
  if (!context) return { success: false as const, error: "Sign in to save favorites." };

  const { data: listing, error: lookupError } = await context.supabase.from("listings")
    .select("id,seller_id").eq("id", parsed.data).eq("status", "ACTIVE").maybeSingle();
  if (lookupError) {
    console.error("Favorite listing lookup failed:", lookupError);
    return { success: false as const, error: "This listing cannot be favorited right now." };
  }
  if (!listing || listing.seller_id === context.user.id) return { success: false as const, error: "This listing cannot be favorited." };

  const { error } = await context.supabase.from("favorites").upsert(
    { user_id: context.user.id, listing_id: parsed.data },
    { onConflict: "user_id,listing_id", ignoreDuplicates: true },
  );
  if (error) {
    console.error("Favorite creation failed:", error);
    return { success: false as const, error: "This listing cannot be favorited right now." };
  }
  return { success: true as const };
}

export async function removeFavorite(listingId: unknown) {
  const parsed = favoriteListingIdSchema.safeParse(listingId);
  if (!parsed.success) return { success: false as const, error: "This listing could not be found." };
  const context = await authenticatedContext();
  if (!context) return { success: false as const, error: "Sign in to manage favorites." };
  const { error } = await context.supabase.from("favorites").delete()
    .eq("user_id", context.user.id).eq("listing_id", parsed.data);
  if (error) {
    console.error("Favorite removal failed:", error);
    return { success: false as const, error: "The favorite could not be removed right now." };
  }
  return { success: true as const };
}

export async function isFavorite(listingId: unknown): Promise<boolean> {
  const parsed = favoriteListingIdSchema.safeParse(listingId);
  if (!parsed.success) return false;
  const context = await authenticatedContext();
  if (!context) return false;
  const { data, error } = await context.supabase.from("favorites").select("listing_id")
    .eq("user_id", context.user.id).eq("listing_id", parsed.data).maybeSingle();
  if (error) {
    console.error("Favorite status lookup failed:", error);
    return false;
  }
  return Boolean(data);
}

export async function getFavoriteListingIds(listingIds?: string[]): Promise<string[]> {
  if (listingIds && (listingIds.length > 100 || listingIds.some((id) => !favoriteListingIdSchema.safeParse(id).success))) {
    throw new Error("Invalid listing identifiers.");
  }
  const context = await authenticatedContext();
  if (!context) return [];
  let query = context.supabase.from("favorites").select("listing_id").eq("user_id", context.user.id);
  if (listingIds) {
    if (listingIds.length === 0) return [];
    query = query.in("listing_id", listingIds);
  }
  const { data, error } = await query;
  if (error) {
    console.error("Favorite list lookup failed:", error);
    throw new Error("Favorites are temporarily unavailable.");
  }
  const favoriteIds = (data ?? []).map((row) => row.listing_id as string);
  if (favoriteIds.length === 0) return [];
  const { data: activeListings, error: activeError } = await context.supabase.from("listings")
    .select("id").in("id", favoriteIds).eq("status", "ACTIVE");
  if (activeError) {
    console.error("Active favorite listing lookup failed:", activeError);
    throw new Error("Favorites are temporarily unavailable.");
  }
  return (activeListings ?? []).map((listing) => listing.id as string);
}

export async function getFavoriteListings(): Promise<ListingRecord[]> {
  const ids = await getFavoriteListingIds();
  if (ids.length === 0) return [];
  const context = await authenticatedContext();
  if (!context) return [];
  const listings: ListingRecord[] = [];
  for (let offset = 0; offset < ids.length; offset += 24) {
    const batch = ids.slice(offset, offset + 24);
    const { data, error } = await context.supabase.from("listings").select(FAVORITE_LISTING_COLUMNS)
      .in("id", batch).eq("status", "ACTIVE").order("created_at", { ascending: false });
    if (error) {
      console.error("Favorite listings lookup failed:", error);
      throw new Error("Your favorites are temporarily unavailable.");
    }
    listings.push(...((data ?? []) as unknown as ListingRecord[]));
  }
  listings.sort((left, right) => right.created_at.localeCompare(left.created_at));
  const imageBatches = await Promise.all(Array.from({ length: Math.ceil(listings.length / 24) }, (_, batch) =>
    getActiveListingPrimaryImageUrls(listings.slice(batch * 24, batch * 24 + 24).map((listing) => listing.id))));
  const images = Object.assign({}, ...imageBatches);
  const sellerBatches = await Promise.all(Array.from({ length: Math.ceil(listings.length / 24) }, (_, batch) =>
    getPublicSellerProfilesForListings(listings.slice(batch * 24, batch * 24 + 24).map((listing) => listing.id))));
  const sellers = new Map<string, NonNullable<ListingRecord["profiles"]>>(sellerBatches.flatMap((batch) => [...batch]));
  return listings.map((listing) => ({ ...listing, profiles: sellers.get(listing.id) ?? null, primaryImageUrl: images[listing.id] ?? null }));
}
