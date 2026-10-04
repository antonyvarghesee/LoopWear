import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { sellerPageSchema, sellerUsernameSchema, SELLER_LISTING_PAGE_SIZE } from "@/lib/validations/seller-profile";
import { getActiveListingPrimaryImageUrls } from "@/services/listing-images";
import type { ListingRecord } from "@/types/listing-management";

export interface PublicSellerProfile {
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  created_at: string;
}

export async function getPublicSellerProfile(username: unknown): Promise<PublicSellerProfile | null> {
  const parsed = sellerUsernameSchema.safeParse(username);
  if (!parsed.success) return null;
  if (!isSupabaseConfigured()) throw new Error("Seller profiles are temporarily unavailable.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("seller_profiles")
    .select("username,full_name,avatar_url,bio,location,created_at")
    .eq("username", parsed.data).maybeSingle();
  if (error) {
    console.error("Public seller profile lookup failed:", error);
    throw new Error("Seller profiles are temporarily unavailable.");
  }
  return data as PublicSellerProfile | null;
}

export async function getPublicSellerProfilesForListings(listingIds: string[]) {
  if (listingIds.length === 0) return new Map<string, NonNullable<ListingRecord["profiles"]>>();
  if (listingIds.length > 24 || new Set(listingIds).size !== listingIds.length) {
    throw new Error("Invalid listing identifiers.");
  }
  if (!isSupabaseConfigured()) throw new Error("Seller details are temporarily unavailable.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_seller_profiles_for_listings", { p_listing_ids: listingIds });
  if (error) {
    console.error("Public listing seller lookup failed:", error);
    throw new Error("Seller details are temporarily unavailable.");
  }
  const rows = (data ?? []) as Array<{ listing_id: string; username: string; full_name: string | null; avatar_url: string | null; rating: number | string; review_count: number; is_verified: boolean }>;
  return new Map<string, NonNullable<ListingRecord["profiles"]>>(rows.map((row) => [row.listing_id, {
    username: row.username as string,
    full_name: row.full_name as string | null,
    avatar_url: row.avatar_url as string | null,
    rating: Number(row.rating),
    review_count: Number(row.review_count),
    is_verified: Boolean(row.is_verified),
  }]));
}

export async function getSellerActiveListings(username: unknown, page: number) {
  const parsedUsername = sellerUsernameSchema.safeParse(username);
  const parsedPage = sellerPageSchema.safeParse(page);
  if (!parsedUsername.success || !parsedPage.success) throw new Error("Invalid seller listing request.");
  if (!isSupabaseConfigured()) throw new Error("Seller listings are temporarily unavailable.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_seller_active_listings", {
    p_username: parsedUsername.data,
    p_page: parsedPage.data,
  });
  if (error || !data || typeof data !== "object") {
    if (error) console.error("Seller active listings lookup failed:", error);
    throw new Error("Seller listings are temporarily unavailable.");
  }
  const result = data as { total: number; listings: ListingRecord[] };
  const listings = Array.isArray(result.listings) ? result.listings : [];
  const images = listings.length ? await getActiveListingPrimaryImageUrls(listings.map((listing) => listing.id)) : {};
  return {
    listings: listings.map((listing) => ({ ...listing, primaryImageUrl: images[listing.id] ?? null })),
    total: Number(result.total) || 0,
    page: parsedPage.data,
    pageSize: SELLER_LISTING_PAGE_SIZE,
  };
}
