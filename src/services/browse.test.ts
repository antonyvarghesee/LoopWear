import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getActiveListingPrimaryImageUrls } = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn(), getActiveListingPrimaryImageUrls: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/listing-images", () => ({ getActiveListingPrimaryImageUrls }));

import { searchActiveListings } from "@/services/browse";
import { parseBrowseParams } from "@/lib/validations/browse";

function makeQuery(response: { data: unknown[] | null; count: number | null; error: null }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = Object.fromEntries(["select", "eq", "or", "gte", "lte", "ilike", "order", "range"].map((method) => [method, (...args: unknown[]) => {
    calls.push([method, ...args]);
    return method === "range" ? Promise.resolve(response) : query;
  }])) as Record<string, (...args: unknown[]) => unknown>;
  return { query, calls };
}

describe("active listing browse query", () => {
  beforeEach(() => { createSupabaseServerClient.mockReset(); getActiveListingPrimaryImageUrls.mockReset().mockResolvedValue({}); });
  it("enforces ACTIVE status, safely searches punctuation, combines catalog/enum/price filters and paginates in the database", async () => {
    const listing = { id: "00000000-0000-4000-8000-000000000010", slug: "shirt", status: "ACTIVE" };
    const { query, calls } = makeQuery({ data: [listing], count: 25, error: null });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });
    getActiveListingPrimaryImageUrls.mockResolvedValue({ [listing.id]: "https://signed.test/only" });
    const options = { categories: [{ id: "cat-id", slug: "tops", name: "Tops" }], brands: [{ id: "brand-id", slug: "zara", name: "Zara" }] };
    const result = await searchActiveListings(parseBrowseParams({ q: 'women\'s (blue), 50%', category: "tops", brand: "zara", gender: "Women", minPrice: "300", maxPrice: "1500", sort: "price_asc", page: "2" }), options);
    expect(calls).toContainEqual(["eq", "status", "ACTIVE"]);
    expect(calls).toContainEqual(["eq", "category_id", "cat-id"]);
    expect(calls).toContainEqual(["eq", "brand_id", "brand-id"]);
    expect(calls).toContainEqual(["eq", "gender", "Women"]);
    expect(calls).toContainEqual(["gte", "selling_price", 300]);
    expect(calls).toContainEqual(["lte", "selling_price", 1500]);
    expect(calls).toContainEqual(["range", 12, 23]);
    const search = calls.find(([method]) => method === "or")?.[1] as string;
    expect(search).toContain("title.ilike.");
    expect(search).toContain("description.ilike.");
    expect(search).toContain("\"%women's (blue), 50");
    expect(calls).toContainEqual(["order", "selling_price", { ascending: true }]);
    expect(result).toMatchObject({ total: 25, listings: [{ primaryImageUrl: "https://signed.test/only" }] });
    expect(getActiveListingPrimaryImageUrls).toHaveBeenCalledWith([listing.id]);
  });

  it("ignores unknown catalog filters and returns a valid empty result without signing images", async () => {
    const { query, calls } = makeQuery({ data: [], count: 0, error: null });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });
    const result = await searchActiveListings(parseBrowseParams({ category: "untrusted-sql", brand: "missing", sort: "invalid" }), { categories: [], brands: [] });
    expect(calls).toContainEqual(["eq", "status", "ACTIVE"]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(calls.some(([method, column]) => method === "eq" && (column === "category_id" || column === "brand_id"))).toBe(false);
    expect(result).toMatchObject({ total: 0, listings: [] });
    expect(getActiveListingPrimaryImageUrls).not.toHaveBeenCalled();
  });
});
