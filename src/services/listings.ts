import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createListingSchema, type CreateListingInput } from "@/lib/validations/listing";
import { slugifyListingTitle } from "@/lib/listings/slug";
import type { ListingBrand, ListingCategory, ListingRecord, ListingStatus } from "@/types/listing-management";
import { getCurrentUser } from "@/services/auth";
import { getOwnListingPrimaryImageUrls } from "@/services/listing-images";
import { getPublicSellerProfilesForListings } from "@/services/seller-profiles";
import { isCurrentUserSuspended } from "@/services/moderation-enforcement";

const LISTING_COLUMNS = "id, seller_id, title, slug, description, category_id, brand_id, gender, size, condition, color, material, original_price, selling_price, location, status, created_at, updated_at, categories!listings_category_id_fkey(name), brands!listings_brand_id_fkey(name)";
const PUBLIC_LISTING_COLUMNS = LISTING_COLUMNS;

export type ListingResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

export function canTransitionListingStatus(
  from: ListingStatus,
  to: ListingStatus,
  actor: "seller" | "system" = "seller",
): boolean {
  if (from === to) return true;
  if (from === "DRAFT" && ["ACTIVE", "ARCHIVED", "REMOVED"].includes(to)) return true;
  if (from === "ACTIVE" && ["ARCHIVED", "REMOVED"].includes(to)) return true;
  if (from === "ARCHIVED" && to === "REMOVED") return true;
  return actor === "system" && from === "ACTIVE" && to === "SOLD";
}

function getWriteFields(input: CreateListingInput) {
  return {
    title: input.title,
    description: input.description,
    category_id: input.categoryId,
    brand_id: input.brandId,
    gender: input.gender,
    size: input.size,
    condition: input.condition,
    color: input.color ?? null,
    material: input.material ?? null,
    original_price: input.originalPrice ?? null,
    selling_price: input.sellingPrice,
    location: input.location ?? null,
  };
}

function validationError(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): ListingResult<never> {
  const fieldErrors = Object.fromEntries(
    error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
  );
  return { success: false, error: "Review the highlighted listing details.", fieldErrors };
}

function databaseError(error: { code?: string; message: string }, operation: string): ListingResult<never> {
  console.error(`Listing ${operation} failed:`, error);
  if (error.code === "23503") {
    return { success: false, error: "Choose a category and brand from the available options." };
  }
  if (error.code === "23505") {
    return { success: false, error: "We couldn't reserve a listing URL. Please try again." };
  }
  if (error.code === "23514") {
    return { success: false, error: "Review the listing details and try again." };
  }
  return { success: false, error: "We couldn't save this listing. Please try again." };
}

async function currentSeller() {
  return getCurrentUser();
}

export async function getListingFormOptions(): Promise<{ categories: ListingCategory[]; brands: ListingBrand[] }> {
  if (!isSupabaseConfigured()) throw new Error("Listing catalog is unavailable.");
  const supabase = await createSupabaseServerClient();
  const [categoriesResult, brandsResult] = await Promise.all([
    supabase.from("categories").select("id, name, slug").order("name"),
    supabase.from("brands").select("id, name, slug").order("name"),
  ]);
  if (categoriesResult.error || brandsResult.error) {
    console.error("Unable to load listing catalogs:", categoriesResult.error ?? brandsResult.error);
    throw new Error("Listing options are temporarily unavailable.");
  }
  return {
    categories: (categoriesResult.data ?? []) as ListingCategory[],
    brands: (brandsResult.data ?? []) as ListingBrand[],
  };
}

export async function createDraftListing(input: unknown): Promise<ListingResult<ListingRecord>> {
  const seller = await currentSeller();
  if (!seller) return { success: false, error: "Sign in to create a listing." };
  if (await isCurrentUserSuspended()) return { success: false, error: "Your account cannot manage listings right now." };
  const parsed = createListingSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("listings")
    .insert({ ...getWriteFields(parsed.data), slug: slugifyListingTitle(parsed.data.title) })
    .select(LISTING_COLUMNS)
    .single();
  if (error) return databaseError(error, "creation");
  return { success: true, data: data as ListingRecord };
}

export async function updateOwnListing(id: string, input: unknown): Promise<ListingResult<ListingRecord>> {
  const seller = await currentSeller();
  if (!seller) return { success: false, error: "Sign in to update a listing." };
  if (await isCurrentUserSuspended()) return { success: false, error: "Your account cannot manage listings right now." };
  const parsed = createListingSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data: current, error: lookupError } = await supabase
    .from("listings")
    .select("id, status")
    .eq("id", id)
    .eq("seller_id", seller.id)
    .maybeSingle();
  if (lookupError) return databaseError(lookupError, "lookup");
  if (!current) return { success: false, error: "This listing could not be found." };
  if (current.status === "SOLD" || current.status === "REMOVED") {
    return { success: false, error: "This listing can no longer be edited." };
  }

  const { data, error } = await supabase
    .from("listings")
    .update(getWriteFields(parsed.data))
    .eq("id", id)
    .eq("seller_id", seller.id)
    .eq("status", current.status)
    .select(LISTING_COLUMNS)
    .maybeSingle();
  if (error) return databaseError(error, "update");
  if (!data) return { success: false, error: "This listing changed while you were editing. Reload and try again." };
  return { success: true, data: data as ListingRecord };
}

async function transitionOwnListing(id: string, target: ListingStatus): Promise<ListingResult<ListingRecord>> {
  const seller = await currentSeller();
  if (!seller) return { success: false, error: "Sign in to manage your listings." };
  if (await isCurrentUserSuspended()) return { success: false, error: "Your account cannot manage listings right now." };
  const supabase = await createSupabaseServerClient();
  const { data: current, error: lookupError } = await supabase
    .from("listings")
    .select("id, status")
    .eq("id", id)
    .eq("seller_id", seller.id)
    .maybeSingle();
  if (lookupError) return databaseError(lookupError, "lookup");
  if (!current) return { success: false, error: "This listing could not be found." };
  if (!canTransitionListingStatus(current.status as ListingStatus, target)) {
    return { success: false, error: "That action isn't available for this listing." };
  }
  if (current.status === target) {
    const { data, error } = await supabase.from("listings").select(LISTING_COLUMNS).eq("id", id).eq("seller_id", seller.id).single();
    if (error) return databaseError(error, "lookup");
    return { success: true, data: data as ListingRecord };
  }

  const { data, error } = await supabase
    .from("listings")
    .update({ status: target })
    .eq("id", id)
    .eq("seller_id", seller.id)
    .eq("status", current.status)
    .select(LISTING_COLUMNS)
    .maybeSingle();
  if (error) return databaseError(error, "status update");
  if (!data) return { success: false, error: "This listing changed before the action completed. Reload and try again." };
  return { success: true, data: data as ListingRecord };
}

export const publishOwnListing = (id: string) => transitionOwnListing(id, "ACTIVE");
export const archiveOwnListing = (id: string) => transitionOwnListing(id, "ARCHIVED");
export const removeOwnListing = (id: string) => transitionOwnListing(id, "REMOVED");

export async function getOwnListings(): Promise<ListingRecord[]> {
  const seller = await currentSeller();
  if (!seller) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("seller_id", seller.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Unable to load seller listings:", error);
    throw new Error("Your listings are temporarily unavailable.");
  }
  const listings = (data ?? []) as ListingRecord[];
  const primaryImages = await getOwnListingPrimaryImageUrls(listings.map((listing) => listing.id));
  return listings.map((listing) => ({ ...listing, primaryImageUrl: primaryImages[listing.id] ?? null }));
}

export async function getOwnListingForEdit(id: string): Promise<ListingRecord | null> {
  const seller = await currentSeller();
  if (!seller) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("id", id)
    .eq("seller_id", seller.id)
    .maybeSingle();
  if (error) {
    console.error("Unable to load listing for editing:", error);
    throw new Error("This listing could not be loaded.");
  }
  if (!data || data.status === "SOLD" || data.status === "REMOVED") return null;
  return data as ListingRecord;
}

export async function getActiveListingBySlug(slug: string): Promise<ListingRecord | null> {
  if (!isSupabaseConfigured()) throw new Error("Listings are temporarily unavailable.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("listings")
    .select(PUBLIC_LISTING_COLUMNS)
    .eq("slug", slug)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error) {
    console.error("Unable to load public listing:", error);
    throw new Error("This listing is temporarily unavailable.");
  }
  if (!data) return null;
  const profiles = await getPublicSellerProfilesForListings([data.id as string]);
  return { ...(data as ListingRecord), profiles: profiles.get(data.id as string) ?? null };
}
