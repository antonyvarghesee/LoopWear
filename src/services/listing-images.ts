import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth";
import { detectImageMime, imageSortOrderSchema, listingImageUploadSchema, MAX_LISTING_IMAGE_BYTES, MAX_LISTING_IMAGES } from "@/lib/validations/listing-image";

const BUCKET = "listing-images";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type ListingImageRecord = { id: string; listing_id: string; storage_path: string; sort_order: number; created_at: string; signedUrl?: string };
export function makeListingImagePath(sellerId: string, listingId: string, extension: string) {
  return `${sellerId}/${listingId}/${randomUUID()}.${extension}`;
}

async function createSignedImageUrl(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, storagePath: string, expiresIn: number) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  return error || !data ? null : data.signedUrl;
}

async function ownedListing(listingId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in to manage listing images.");
  if (!UUID.test(listingId)) throw new Error("This listing could not be found.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("listings").select("id,seller_id,status").eq("id", listingId).eq("seller_id", user.id).maybeSingle();
  if (error || !data || !["DRAFT", "ACTIVE", "ARCHIVED"].includes(data.status)) throw new Error("This listing could not be found or edited.");
  return { user, supabase, listing: data };
}

export async function listOwnListingImages(listingId: string): Promise<ListingImageRecord[]> {
  const { supabase } = await ownedListing(listingId);
  const { data, error } = await supabase.from("listing_images").select("id,listing_id,storage_path,sort_order,created_at").eq("listing_id", listingId).not("storage_path", "is", null).order("sort_order");
  if (error) throw new Error("Listing images are temporarily unavailable.");
  return Promise.all((data ?? []).map(async (image) => {
    return { ...image, signedUrl: (await createSignedImageUrl(supabase, image.storage_path, 3600)) ?? undefined } as ListingImageRecord;
  }));
}

/** Return signed primary-image URLs only for listings owned by the current user. */
export async function getOwnListingPrimaryImageUrls(listingIds: string[]): Promise<Record<string, string>> {
  if (listingIds.length === 0) return {};
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in to view your listing images.");
  if (listingIds.some((id) => !UUID.test(id)) || new Set(listingIds).size !== listingIds.length) {
    throw new Error("Invalid listing identifiers.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: listings, error: listingsError } = await supabase
    .from("listings").select("id").in("id", listingIds).eq("seller_id", user.id);
  if (listingsError) throw new Error("Your listing images are temporarily unavailable.");
  const ownedIds = new Set((listings ?? []).map((listing) => listing.id as string));
  if (ownedIds.size !== listingIds.length) throw new Error("A listing could not be found or viewed.");

  const { data: images, error } = await supabase.from("listing_images")
    .select("listing_id,storage_path,sort_order")
    .in("listing_id", listingIds).not("storage_path", "is", null).order("sort_order");
  if (error) throw new Error("Your listing images are temporarily unavailable.");

  const primaryByListing = new Map<string, string>();
  for (const image of images ?? []) {
    if (!primaryByListing.has(image.listing_id as string)) primaryByListing.set(image.listing_id as string, image.storage_path as string);
  }
  const entries = await Promise.all([...primaryByListing].map(async ([listingId, storagePath]) => {
    const signedUrl = await createSignedImageUrl(supabase, storagePath, 300);
    return signedUrl ? [listingId, signedUrl] as const : null;
  }));
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null));
}

export async function uploadListingImage(listingId: string, file: File) {
  const { user, supabase } = await ownedListing(listingId);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const parsed = listingImageUploadSchema.safeParse({ type: file.type, extension: ext, size: file.size });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Choose a JPEG, PNG, or WebP image under 5 MB.");
  if (file.size > MAX_LISTING_IMAGE_BYTES) throw new Error("Choose an image under 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageMime(bytes);
  if (!detected || detected !== parsed.data.type) throw new Error("The file contents do not match the selected image type.");
  const { count, error: countError } = await supabase.from("listing_images").select("id", { count: "exact", head: true }).eq("listing_id", listingId);
  if (countError) throw new Error("Unable to check the listing image limit.");
  if ((count ?? 0) >= MAX_LISTING_IMAGES) throw new Error(`A listing can have at most ${MAX_LISTING_IMAGES} images.`);
  const storagePath = makeListingImagePath(user.id, listingId, parsed.data.extension === "jpeg" ? "jpg" : parsed.data.extension);
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, { contentType: detected, upsert: false });
  if (uploadError) throw new Error("Image upload failed. Please try again.");
  const { data: row, error: insertError } = await supabase.from("listing_images").insert({ listing_id: listingId, storage_path: storagePath, sort_order: count ?? 0 }).select("id,listing_id,storage_path,sort_order,created_at").single();
  if (insertError || !row) {
    const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (cleanupError) console.error("Unable to clean up orphaned listing image:", cleanupError);
    throw new Error("The image could not be saved. Please try again.");
  }
  return row as ListingImageRecord;
}

export async function deleteListingImage(listingId: string, imageId: string) {
  const { supabase } = await ownedListing(listingId);
  if (!UUID.test(imageId)) throw new Error("This image could not be found.");
  const { data: image, error: findError } = await supabase.from("listing_images").select("id,storage_path").eq("id", imageId).eq("listing_id", listingId).single();
  if (findError || !image?.storage_path) throw new Error("This image could not be found.");
  const { error: deleteError } = await supabase.from("listing_images").delete().eq("id", imageId).eq("listing_id", listingId);
  if (deleteError) throw new Error("The image could not be deleted.");
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([image.storage_path]);
  if (storageError) {
    console.error("Image metadata was deleted but its Storage object remains:", storageError);
    throw new Error("Image removed from the listing, but Storage cleanup failed.");
  }
}

export async function reorderListingImages(listingId: string, orderedIds: string[]) {
  const { supabase } = await ownedListing(listingId);
  if (!Array.isArray(orderedIds) || orderedIds.length > MAX_LISTING_IMAGES || orderedIds.some((id) => !UUID.test(id)) || new Set(orderedIds).size !== orderedIds.length) throw new Error("Invalid image order.");
  const { data, error } = await supabase.from("listing_images").select("id,sort_order").eq("listing_id", listingId);
  if (error || data?.length !== orderedIds.length || data.some((row) => !orderedIds.includes(row.id))) throw new Error("Image order does not match this listing.");
  for (const row of data) {
    const { error: stagingError } = await supabase.from("listing_images").update({ sort_order: 100 + row.sort_order }).eq("id", row.id).eq("listing_id", listingId);
    if (stagingError) throw new Error("Images could not be reordered.");
  }
  for (const [sort_order, id] of orderedIds.entries()) {
    if (!imageSortOrderSchema.safeParse(sort_order).success) throw new Error("Invalid image order.");
    const { error: updateError } = await supabase.from("listing_images").update({ sort_order }).eq("id", id).eq("listing_id", listingId);
    if (updateError) throw new Error("Images could not be reordered.");
  }
}

export async function getActiveListingImageUrls(listingId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: listing } = await supabase.from("listings").select("id").eq("id", listingId).eq("status", "ACTIVE").maybeSingle();
  if (!listing) return [];
  const { data, error } = await supabase.from("listing_images").select("id,storage_path,sort_order").eq("listing_id", listingId).not("storage_path", "is", null).order("sort_order");
  if (error) throw new Error("Listing images are temporarily unavailable.");
  return Promise.all((data ?? []).map(async (image) => {
    const url = await createSignedImageUrl(supabase, image.storage_path, 300);
    if (!url) return null;
    return { id: image.id as string, url };
  })).then((images) => images.filter((image): image is {id: string; url: string} => image !== null));
}
