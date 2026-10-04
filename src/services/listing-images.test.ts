import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser } = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/auth", () => ({ getCurrentUser }));

import { deleteListingImage, getActiveListingImageUrls, getOwnListingPrimaryImageUrls, makeListingImagePath, reorderListingImages } from "@/services/listing-images";

const listingId = "00000000-0000-4000-8000-000000000010";
const imageId = "00000000-0000-4000-8000-000000000011";

describe("listing image authorization", () => {
  beforeEach(() => { createSupabaseServerClient.mockReset(); getCurrentUser.mockReset(); });
  it("builds seller/listing scoped paths with generated UUID filenames", () => {
    const path = makeListingImagePath("seller-id", listingId, "webp");
    expect(path).toMatch(new RegExp(`^seller-id/${listingId}/[0-9a-f-]{36}\\.webp$`));
  });
  it("refuses delete and reorder when the listing is not owned by the session", async () => {
    getCurrentUser.mockResolvedValue({ id: "seller-a" });
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });
    await expect(deleteListingImage(listingId, imageId)).rejects.toThrow("could not be found or edited");
    await expect(reorderListingImages(listingId, [imageId])).rejects.toThrow("could not be found or edited");
    expect(query.eq).toHaveBeenCalledWith("seller_id", "seller-a");
  });
  it("rejects path traversal and malformed listing identifiers", async () => {
    getCurrentUser.mockResolvedValue({ id: "seller-a" });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn() });
    await expect(deleteListingImage("../other", imageId)).rejects.toThrow("could not be found");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("selects the first image by sort_order and signs only that primary image", async () => {
    getCurrentUser.mockResolvedValue({ id: "seller-a" });
    const ownedQuery = { select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [{ id: listingId }], error: null }) };
    const imageQuery = { select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [
      { listing_id: listingId, storage_path: "seller-a/path/first.webp", sort_order: 0 },
      { listing_id: listingId, storage_path: "seller-a/path/second.webp", sort_order: 1 },
    ], error: null }) };
    const from = vi.fn((table: string) => table === "listings" ? ownedQuery : imageQuery);
    const createSignedUrl = vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed.test/${path}` }, error: null }));
    createSupabaseServerClient.mockResolvedValue({ from, storage: { from: () => ({ createSignedUrl }) } });

    await expect(getOwnListingPrimaryImageUrls([listingId])).resolves.toEqual({ [listingId]: `https://signed.test/seller-a/path/first.webp` });
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(createSignedUrl).toHaveBeenCalledWith("seller-a/path/first.webp", 300);
    expect(ownedQuery.eq).toHaveBeenCalledWith("seller_id", "seller-a");
  });

  it("returns no primary URL for a listing with no images", async () => {
    getCurrentUser.mockResolvedValue({ id: "seller-a" });
    const ownedQuery = { select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [{ id: listingId }], error: null }) };
    const imageQuery = { select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [], error: null }) };
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn((table: string) => table === "listings" ? ownedQuery : imageQuery) });
    await expect(getOwnListingPrimaryImageUrls([listingId])).resolves.toEqual({});
  });

  it("does not sign a private image when the listing is not owned by the session", async () => {
    getCurrentUser.mockResolvedValue({ id: "seller-a" });
    const ownedQuery = { select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const from = vi.fn(() => ownedQuery);
    const createSignedUrl = vi.fn();
    createSupabaseServerClient.mockResolvedValue({ from, storage: { from: () => ({ createSignedUrl }) } });
    await expect(getOwnListingPrimaryImageUrls([listingId])).rejects.toThrow("could not be found or viewed");
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(ownedQuery.eq).toHaveBeenCalledWith("seller_id", "seller-a");
  });

  it("serves public image URLs only after confirming the listing is active", async () => {
    const listingQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: listingId }, error: null }) };
    const imageQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [{ id: imageId, storage_path: "seller-a/image.webp", sort_order: 0 }], error: null }) };
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://signed.test/active" }, error: null }));
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn((table: string) => table === "listings" ? listingQuery : imageQuery), storage: { from: () => ({ createSignedUrl }) } });
    await expect(getActiveListingImageUrls(listingId)).resolves.toEqual([{ id: imageId, url: "https://signed.test/active" }]);
    expect(listingQuery.eq).toHaveBeenCalledWith("status", "ACTIVE");
    expect(createSignedUrl).toHaveBeenCalledWith("seller-a/image.webp", 300);
  });

  it("does not expose draft image URLs through the public image helper", async () => {
    const listingQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    const createSignedUrl = vi.fn();
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => listingQuery), storage: { from: () => ({ createSignedUrl }) } });
    await expect(getActiveListingImageUrls(listingId)).resolves.toEqual([]);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
