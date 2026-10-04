import { z } from "zod";

export const favoriteListingIdSchema = z.string().uuid("This listing could not be found.");
export const favoriteActionInputSchema = z.object({ listingId: favoriteListingIdSchema }).strict();
export type FavoriteActionInput = z.infer<typeof favoriteActionInputSchema>;
