import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { createSupabaseServerClient, getCurrentUser } = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/auth", () => ({ getCurrentUser }));
vi.mock("@/services/listing-images", () => ({ getActiveListingPrimaryImageUrls: vi.fn() }));

import { addFavorite, getFavoriteListingIds, removeFavorite } from "@/services/favorites";

const listingId = "00000000-0000-4000-8000-000000000010";
const userId = "00000000-0000-4000-8000-000000000001";

function setup(options: { listing?: { id: string; seller_id: string } | null; insertError?: { code: string } | null } = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: options.insertError ?? null });
  const deleteQuery: Record<string, unknown> = {};
  deleteQuery.delete = vi.fn(() => deleteQuery);
  deleteQuery.eq = vi.fn(() => deleteQuery);
  deleteQuery.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve);
  const listingQuery = {
    select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: Object.hasOwn(options, "listing") ? options.listing : { id: listingId, seller_id: "seller-id" }, error: null }),
  };
  listingQuery.select.mockReturnValue(listingQuery);
  listingQuery.eq.mockReturnValue(listingQuery);
  const favoriteQuery = { upsert, delete: deleteQuery.delete, eq: deleteQuery.eq, then: deleteQuery.then };
  createSupabaseServerClient.mockResolvedValue({ from: vi.fn((table: string) => table === "listings" ? listingQuery : favoriteQuery) });
  getCurrentUser.mockResolvedValue({ id: userId });
  return { upsert, listingQuery, deleteQuery };
}

describe("favorites service", () => {
  beforeEach(() => { createSupabaseServerClient.mockReset(); getCurrentUser.mockReset(); });

  it("requires authentication before creating a favorite", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await addFavorite(listingId)).toMatchObject({ success: false, error: "Sign in to save favorites." });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("creates a favorite using the session user, never a client user ID", async () => {
    const { upsert } = setup();
    expect(await addFavorite(listingId)).toEqual({ success: true });
    expect(upsert).toHaveBeenCalledWith({ user_id: userId, listing_id: listingId }, { onConflict: "user_id,listing_id", ignoreDuplicates: true });
  });

  it("treats duplicate favorites as success through conflict-safe insertion", async () => {
    const { upsert } = setup();
    expect(await addFavorite(listingId)).toEqual({ success: true });
    expect(upsert).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ ignoreDuplicates: true }));
  });

  it("removes a favorite and safely succeeds when no matching row exists", async () => {
    const { deleteQuery } = setup();
    expect(await removeFavorite(listingId)).toEqual({ success: true });
    expect(deleteQuery.eq).toHaveBeenNthCalledWith(1, "user_id", userId);
    expect(deleteQuery.eq).toHaveBeenNthCalledWith(2, "listing_id", listingId);
  });

  it.each([null, { id: listingId, seller_id: userId }])("rejects an inactive, missing, or own listing", async (listing) => {
    setup({ listing });
    expect(await addFavorite(listingId)).toMatchObject({ success: false });
  });

  it("rejects malformed IDs before querying the database", async () => {
    setup();
    expect(await addFavorite("not-a-uuid")).toMatchObject({ success: false });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("filters batch favorite IDs through the authenticated session query", async () => {
    const favoriteQuery: Record<string, unknown> = { select: vi.fn(), eq: vi.fn(), in: vi.fn() };
    favoriteQuery.select = vi.fn(() => favoriteQuery);
    favoriteQuery.eq = vi.fn(() => favoriteQuery);
    favoriteQuery.in = vi.fn(() => favoriteQuery);
    favoriteQuery.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ listing_id: listingId }], error: null }).then(resolve);
    const activeQuery: Record<string, unknown> = { select: vi.fn(), in: vi.fn(), eq: vi.fn() };
    activeQuery.select = vi.fn(() => activeQuery);
    activeQuery.in = vi.fn(() => activeQuery);
    activeQuery.eq = vi.fn(() => activeQuery);
    activeQuery.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: listingId }], error: null }).then(resolve);
    const from = vi.fn((table: string) => table === "favorites" ? favoriteQuery : activeQuery);
    createSupabaseServerClient.mockResolvedValue({ from });
    getCurrentUser.mockResolvedValue({ id: userId });
    expect(await getFavoriteListingIds([listingId])).toEqual([listingId]);
    expect(favoriteQuery.eq).toHaveBeenCalledWith("user_id", userId);
    expect(favoriteQuery.in).toHaveBeenCalledWith("listing_id", [listingId]);
    expect(activeQuery.eq).toHaveBeenCalledWith("status", "ACTIVE");
  });

  it("defines owner-only RLS and active, non-self listing checks in the migration", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261004000006_favorites.sql"), "utf8");
    expect(migration).toContain("(SELECT auth.uid()) = user_id");
    expect(migration).toContain("listing.status = 'ACTIVE'");
    expect(migration).toContain("listing.seller_id <> (SELECT auth.uid())");
    expect(migration).toContain("ON public.favorites FOR DELETE TO authenticated");
    expect(migration).toContain("GRANT SELECT, INSERT, DELETE ON TABLE public.favorites TO authenticated");
    expect(migration).not.toMatch(/CREATE POLICY[^;]+FOR UPDATE/i);
  });
});
