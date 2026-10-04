import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { createSupabaseServerClient, getActiveListingPrimaryImageUrls } = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn(), getActiveListingPrimaryImageUrls: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/listing-images", () => ({ getActiveListingPrimaryImageUrls }));

import { getPublicSellerProfile, getPublicSellerProfilesForListings, getSellerActiveListings } from "@/services/seller-profiles";

const listingId = "00000000-0000-4000-8000-000000000010";

describe("public seller profile data access", () => {
  beforeEach(() => { createSupabaseServerClient.mockReset(); getActiveListingPrimaryImageUrls.mockReset().mockResolvedValue({}); });

  it("looks up a valid username through the limited public seller projection", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { username: "loop_wear", full_name: "Loop Wear", avatar_url: null, bio: "Secondhand style", location: "Portland", created_at: "2026-01-01T00:00:00Z" }, error: null }) };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });
    const result = await getPublicSellerProfile("loop_wear");
    expect(query.select).toHaveBeenCalledWith("username,full_name,avatar_url,bio,location,created_at");
    expect(query.eq).toHaveBeenCalledWith("username", "loop_wear");
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("updated_at");
  });

  it("returns null for an unknown username", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });
    await expect(getPublicSellerProfile("unknown_user")).resolves.toBeNull();
  });

  it("rejects malformed usernames before making a database request", async () => {
    await expect(getPublicSellerProfile("../private")).resolves.toBeNull();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("returns the username-scoped active listing page with batched images and no seller ID", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { total: 1, listings: [{ id: listingId, title: "Jacket", slug: "jacket", status: "ACTIVE", created_at: "2026-02-01T00:00:00Z", profiles: { username: "loop_wear" } }] }, error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });
    getActiveListingPrimaryImageUrls.mockResolvedValue({ [listingId]: "https://signed.example/image" });
    const result = await getSellerActiveListings("loop_wear", 2);
    expect(rpc).toHaveBeenCalledWith("get_seller_active_listings", { p_username: "loop_wear", p_page: 2 });
    expect(result).toMatchObject({ total: 1, listings: [{ status: "ACTIVE", primaryImageUrl: "https://signed.example/image" }] });
    expect(result.listings[0]).not.toHaveProperty("seller_id");
    expect(getActiveListingPrimaryImageUrls).toHaveBeenCalledWith([listingId]);
  });

  it("handles a seller with zero active listings", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { total: 0, listings: [] }, error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });
    await expect(getSellerActiveListings("loop_wear", 1)).resolves.toMatchObject({ total: 0, listings: [] });
    expect(getActiveListingPrimaryImageUrls).not.toHaveBeenCalled();
  });

  it("maps active listing IDs to public seller fields without returning a profile/auth ID", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ listing_id: listingId, username: "loop_wear", full_name: "Loop Wear", avatar_url: null, rating: "5", review_count: 3, is_verified: false }], error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });
    const result = await getPublicSellerProfilesForListings([listingId]);
    expect(rpc).toHaveBeenCalledWith("get_public_seller_profiles_for_listings", { p_listing_ids: [listingId] });
    expect(result.get(listingId)).toEqual({ username: "loop_wear", full_name: "Loop Wear", avatar_url: null, rating: 5, review_count: 3, is_verified: false });
    expect(result.get(listingId)).not.toHaveProperty("id");
  });

  it("defines owner-only base-table reads and public projections/functions that exclude profile IDs", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261004000007_public_seller_profiles.sql"), "utf8");
    expect(migration).toContain("TO authenticated USING ((SELECT auth.uid()) = id)");
    expect(migration).toContain("REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT SELECT ON TABLE public.seller_profiles TO anon, authenticated");
    expect(migration).toContain("listing.status = 'ACTIVE'");
    expect(migration).toContain("JOIN seller ON seller.id = listing.seller_id");
    const projection = migration.slice(migration.indexOf("CREATE OR REPLACE VIEW public.seller_profiles"), migration.indexOf("CREATE OR REPLACE FUNCTION public.get_public_seller_profiles_for_listings"));
    expect(projection).not.toMatch(/\bid\b|email|updated_at/i);
  });
});
