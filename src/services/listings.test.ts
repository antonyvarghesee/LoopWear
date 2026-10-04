import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/auth", () => ({ getCurrentUser }));

import {
  archiveOwnListing,
  canTransitionListingStatus,
  createDraftListing,
  publishOwnListing,
  removeOwnListing,
  updateOwnListing,
} from "@/services/listings";

const listingInput = {
  title: "Vintage Levi's denim jacket",
  description: "A well cared for vintage denim jacket with a relaxed fit.",
  categoryId: "00000000-0000-4000-8000-000000000001",
  brandId: "00000000-0000-4000-8000-000000000002",
  gender: "Unisex",
  size: "M",
  condition: "Very Good",
  color: "Indigo",
  material: "Cotton denim",
  originalPrice: "120.00",
  sellingPrice: "45.50",
  location: "Portland, OR",
};

function makeQuery(responses: Array<{ data: unknown; error: null | { code?: string; message: string } }>) {
  const query = {
    inserted: undefined as Record<string, unknown> | undefined,
    updated: undefined as Record<string, unknown> | undefined,
    filters: [] as Array<[string, unknown]>,
    insert(value: Record<string, unknown>) { this.inserted = value; return this; },
    update(value: Record<string, unknown>) { this.updated = value; return this; },
    select() { return this; },
    eq(column: string, value: unknown) { this.filters.push([column, value]); return this; },
    in(column: string, value: unknown) { this.filters.push([column, value]); return this; },
    maybeSingle: vi.fn(async () => responses.shift() ?? { data: null, error: null }),
    single: vi.fn(async () => responses.shift() ?? { data: null, error: null }),
  };
  return query;
}

describe("listing service authorization and lifecycle", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getCurrentUser.mockReset();
  });

  it("creates a draft with a server-derived seller and a generated slug hint", async () => {
    getCurrentUser.mockResolvedValue({ id: "seller-a" });
    const query = makeQuery([{ data: { id: "listing-a", seller_id: "seller-a", status: "DRAFT", slug: "vintage-levi-s-denim-jacket" }, error: null }]);
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });

    const result = await createDraftListing(listingInput);

    expect(result.success).toBe(true);
    expect(query.inserted?.slug).toBe("vintage-levi-s-denim-jacket");
    expect(query.inserted).not.toHaveProperty("seller_id");
    expect(query.inserted).not.toHaveProperty("status");
    expect(query.inserted?.selling_price).toBe(45.5);
  });

  it("does not query or mutate listings for a signed-out user", async () => {
    getCurrentUser.mockResolvedValue(null);
    const result = await createDraftListing(listingInput);
    expect(result.success).toBe(false);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("scopes edits to the authenticated seller and refuses another seller's listing", async () => {
    getCurrentUser.mockResolvedValue({ id: "seller-a" });
    const query = makeQuery([{ data: null, error: null }]);
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });

    const result = await updateOwnListing("00000000-0000-4000-8000-000000000010", listingInput);

    expect(result).toEqual({ success: false, error: "This listing could not be found." });
    expect(query.filters).toContainEqual(["seller_id", "seller-a"]);
    expect(query.updated).toBeUndefined();
  });

  it("updates editable fields on the authenticated seller's own listing", async () => {
    getCurrentUser.mockResolvedValue({ id: "seller-a" });
    const query = makeQuery([
      { data: { id: "listing-a", status: "DRAFT" }, error: null },
      { data: { id: "listing-a", seller_id: "seller-a", status: "DRAFT", title: "Vintage Levi's denim jacket" }, error: null },
    ]);
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });

    const result = await updateOwnListing("00000000-0000-4000-8000-000000000010", listingInput);

    expect(result.success).toBe(true);
    expect(query.updated?.title).toBe("Vintage Levi's denim jacket");
    expect(query.updated).not.toHaveProperty("seller_id");
    expect(query.filters).toContainEqual(["seller_id", "seller-a"]);
    expect(query.filters).toContainEqual(["status", "DRAFT"]);
  });

  it("publishes a draft using a conditional owner-scoped status update", async () => {
    getCurrentUser.mockResolvedValue({ id: "seller-a" });
    const query = makeQuery([
      { data: { id: "listing-a", status: "DRAFT" }, error: null },
      { data: { id: "listing-a", seller_id: "seller-a", status: "ACTIVE", slug: "vintage-jacket" }, error: null },
    ]);
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });

    const result = await publishOwnListing("00000000-0000-4000-8000-000000000010");

    expect(result.success).toBe(true);
    expect(query.updated).toEqual({ status: "ACTIVE" });
    expect(query.filters).toContainEqual(["seller_id", "seller-a"]);
    expect(query.filters).toContainEqual(["status", "DRAFT"]);
  });

  it("archives only allowed states and enforces seller/system transitions", async () => {
    getCurrentUser.mockResolvedValue({ id: "seller-a" });
    const query = makeQuery([
      { data: { id: "listing-a", status: "ACTIVE" }, error: null },
      { data: { id: "listing-a", seller_id: "seller-a", status: "ARCHIVED" }, error: null },
    ]);
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });
    const result = await archiveOwnListing("00000000-0000-4000-8000-000000000010");

    expect(result.success).toBe(true);
    expect(query.updated).toEqual({ status: "ARCHIVED" });
    expect(canTransitionListingStatus("DRAFT", "ACTIVE")).toBe(true);
    expect(canTransitionListingStatus("ACTIVE", "ARCHIVED")).toBe(true);
    expect(canTransitionListingStatus("ACTIVE", "SOLD")).toBe(false);
    expect(canTransitionListingStatus("ACTIVE", "SOLD", "system")).toBe(true);
    expect(canTransitionListingStatus("SOLD", "ACTIVE", "system")).toBe(false);
  });

  it("removes an active listing by transitioning it to REMOVED, never deleting the row", async () => {
    getCurrentUser.mockResolvedValue({ id: "seller-a" });
    const query = makeQuery([
      { data: { id: "listing-a", status: "ACTIVE" }, error: null },
      { data: { id: "listing-a", seller_id: "seller-a", status: "REMOVED" }, error: null },
    ]);
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });

    const result = await removeOwnListing("00000000-0000-4000-8000-000000000010");

    expect(result.success).toBe(true);
    expect(query.updated).toEqual({ status: "REMOVED" });
  });
});
