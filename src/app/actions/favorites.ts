"use server";

import { revalidatePath } from "next/cache";
import { favoriteActionInputSchema } from "@/lib/validations/favorites";
import { addFavorite, removeFavorite } from "@/services/favorites";

export type FavoriteActionResult = { success: boolean; error?: string };

async function favoriteAction(input: unknown, operation: typeof addFavorite | typeof removeFavorite): Promise<FavoriteActionResult> {
  const parsed = favoriteActionInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "This listing could not be found." };
  try {
    const result = await operation(parsed.data.listingId);
    if (!result.success) return result;
    revalidatePath("/browse");
    revalidatePath("/favorites");
    revalidatePath("/listing/[slug]", "page");
    return { success: true };
  } catch (error) {
    console.error("Favorite action failed:", error);
    return { success: false, error: "Your favorites are temporarily unavailable. Please try again." };
  }
}

export async function favoriteListingAction(input: unknown): Promise<FavoriteActionResult> {
  return favoriteAction(input, addFavorite);
}

export async function unfavoriteListingAction(input: unknown): Promise<FavoriteActionResult> {
  return favoriteAction(input, removeFavorite);
}
