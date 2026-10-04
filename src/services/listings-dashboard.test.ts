import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser, getOwnListingPrimaryImageUrls } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  getOwnListingPrimaryImageUrls: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/auth", () => ({ getCurrentUser }));
vi.mock("@/services/listing-images", () => ({ getOwnListingPrimaryImageUrls }));

import { getOwnListings } from "@/services/listings";

const listing = { id: "00000000-0000-4000-8000-000000000010", seller_id: "seller-a", title: "Jacket" };

describe("seller listing dashboard image data", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getCurrentUser.mockReset();
    getOwnListingPrimaryImageUrls.mockReset();
  });

  function setupListings() {
    getCurrentUser.mockResolvedValue({ id: "seller-a" });
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [listing], error: null }) };
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });
  }

  it("attaches the selected primary signed URL to each dashboard listing", async () => {
    setupListings();
    getOwnListingPrimaryImageUrls.mockResolvedValue({ [listing.id]: "https://signed.test/primary" });
    await expect(getOwnListings()).resolves.toEqual([{ ...listing, primaryImageUrl: "https://signed.test/primary" }]);
    expect(getOwnListingPrimaryImageUrls).toHaveBeenCalledWith([listing.id]);
  });

  it("sets primaryImageUrl to null when the listing has no images for the card fallback", async () => {
    setupListings();
    getOwnListingPrimaryImageUrls.mockResolvedValue({});
    await expect(getOwnListings()).resolves.toEqual([{ ...listing, primaryImageUrl: null }]);
  });
});
