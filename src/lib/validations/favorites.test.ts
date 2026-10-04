import { describe, expect, it } from "vitest";
import { favoriteActionInputSchema, favoriteListingIdSchema } from "@/lib/validations/favorites";

describe("favorite input validation", () => {
  it("accepts UUID listing IDs and rejects malformed or extra client fields", () => {
    const listingId = "00000000-0000-4000-8000-000000000010";
    expect(favoriteListingIdSchema.safeParse(listingId).success).toBe(true);
    expect(favoriteListingIdSchema.safeParse("listing-1").success).toBe(false);
    expect(favoriteActionInputSchema.safeParse({ listingId, userId: "spoofed" }).success).toBe(false);
  });
});
