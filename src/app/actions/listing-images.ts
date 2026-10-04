"use server";

import { revalidatePath } from "next/cache";
import { deleteListingImage, reorderListingImages, uploadListingImage } from "@/services/listing-images";

export async function uploadListingImageAction(listingId: string, file: File) {
  try { await uploadListingImage(listingId, file); revalidatePath(`/sell/${listingId}/edit`); return { error: null }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Image upload failed." }; }
}
export async function deleteListingImageAction(listingId: string, imageId: string) {
  try { await deleteListingImage(listingId, imageId); revalidatePath(`/sell/${listingId}/edit`); return { error: null }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Image deletion failed." }; }
}
export async function reorderListingImagesAction(listingId: string, orderedIds: string[]) {
  try { await reorderListingImages(listingId, orderedIds); revalidatePath(`/sell/${listingId}/edit`); return { error: null }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Image reordering failed." }; }
}
