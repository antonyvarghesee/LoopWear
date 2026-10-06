import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser, insert, rpc, isCurrentUserSuspended } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  insert: vi.fn(),
  rpc: vi.fn(),
  isCurrentUserSuspended: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/services/moderation-enforcement", () => ({ isCurrentUserSuspended }));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getPublicSellerReviews,
  getReviewablePurchasesForSeller,
  submitPurchaseReview,
} from "@/services/reviews";

const orderId = "00000000-0000-4000-8000-000000000001";
const buyerId = "00000000-0000-4000-8000-000000000002";

describe("review service", () => {
  beforeEach(() => {
    insert.mockReset().mockResolvedValue({ error: null });
    rpc.mockReset().mockResolvedValue({ data: [], error: null });
    getCurrentUser.mockReset().mockResolvedValue({ id: buyerId });
    isCurrentUserSuspended.mockReset().mockResolvedValue(false);
    createSupabaseServerClient.mockReset().mockResolvedValue({
      from: vi.fn(() => ({ insert })),
      rpc,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits only order, rating, and optional comment for the authenticated buyer", async () => {
    await expect(submitPurchaseReview({
      order_id: orderId,
      rating: 5,
      comment: "Great purchase.",
    })).resolves.toEqual({ success: true });

    expect(insert).toHaveBeenCalledWith({
      order_id: orderId,
      rating: 5,
      comment: "Great purchase.",
    });
    expect(Object.keys(insert.mock.calls.at(0)?.at(0) ?? {}).sort()).toEqual(["comment", "order_id", "rating"]);
  });

  it("accepts omitted/blank optional text as null", async () => {
    await submitPurchaseReview({ order_id: orderId, rating: 4, comment: "" });
    expect(insert).toHaveBeenCalledWith({ order_id: orderId, rating: 4, comment: null });
  });

  it.each([
    { order_id: orderId, rating: 0 },
    { order_id: orderId, rating: 6 },
    { order_id: orderId, rating: 3.5 },
    { order_id: orderId, rating: 4, comment: "x".repeat(1001) },
  ])("rejects an invalid rating or comment", async (input) => {
    await expect(submitPurchaseReview(input)).resolves.toMatchObject({ success: false });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied seller/listing/buyer identifiers", async () => {
    await expect(submitPurchaseReview({
      order_id: orderId,
      rating: 5,
      seller_id: "attacker",
      listing_id: "attacker",
      buyer_id: "attacker",
    })).resolves.toMatchObject({ success: false });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated submissions", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    await expect(submitPurchaseReview({ order_id: orderId, rating: 5 })).resolves.toEqual({
      success: false,
      error: "Sign in to leave a review.",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects review submissions for a suspended user", async () => {
    isCurrentUserSuspended.mockResolvedValue(true);
    await expect(submitPurchaseReview({ order_id: orderId, rating: 5 })).resolves.toEqual({
      success: false,
      error: "Your account cannot submit reviews right now.",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("handles duplicate reviews and database-rejected non-owner orders safely", async () => {
    insert.mockResolvedValueOnce({ error: { code: "23505" } });
    await expect(submitPurchaseReview({ order_id: orderId, rating: 5 })).resolves.toMatchObject({
      success: false,
      error: "You have already reviewed this purchase.",
    });

    insert.mockResolvedValueOnce({ error: { code: "42501" } });
    await expect(submitPurchaseReview({ order_id: orderId, rating: 5 })).resolves.toMatchObject({
      success: false,
      error: "This purchase is not eligible for a review.",
    });
  });

  it("uses only the bounded public seller reviews RPC", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ listing_id: orderId, rating: 5, comment: "Great.", created_at: "2026-10-06T00:00:00Z" }],
      error: null,
    });

    await expect(getPublicSellerReviews({ username: "seller_1", listingId: orderId, limit: 8 }))
      .resolves.toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("get_public_seller_reviews", {
      p_username: "seller_1",
      p_listing_id: orderId,
      p_limit: 8,
      p_offset: 0,
    });
  });

  it("does not return a review form to anonymous users", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    await expect(getReviewablePurchasesForSeller("seller_1")).resolves.toEqual([]);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("only queries delivered purchases for review eligibility", async () => {
    const orderQuery = { data: [], error: null, eq: vi.fn() };
    orderQuery.eq.mockReturnValue(orderQuery);
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "seller-id" }, error: null });
    const selectOrders = vi.fn().mockReturnValue(orderQuery);
    const adminFrom = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle })),
          })),
        };
      }
      return { select: selectOrders };
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValueOnce({ from: adminFrom } as never);

    await expect(getReviewablePurchasesForSeller("seller_1")).resolves.toEqual([]);
    expect(selectOrders).toHaveBeenCalledWith("id, listing_id, amount, status");
    expect(adminFrom).toHaveBeenCalledWith("orders");
    expect(orderQuery.eq.mock.calls).toEqual([
      ["buyer_id", buyerId],
      ["seller_id", "seller-id"],
      ["status", "delivered"],
    ]);
  });
});
