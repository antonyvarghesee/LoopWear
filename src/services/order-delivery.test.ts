import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseServerClient,
  getCurrentUser,
  isCurrentUserSuspended,
  rpc,
  notifyOrderDelivered,
} = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  isCurrentUserSuspended: vi.fn(),
  rpc: vi.fn(),
  notifyOrderDelivered: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/auth", () => ({ getCurrentUser }));
vi.mock("@/services/moderation-enforcement", () => ({ isCurrentUserSuspended }));
vi.mock("@/services/notification-events", () => ({ notifyOrderDelivered }));

import {
  confirmOrderDelivery,
  getBuyerOrders,
  getSellerOrders,
  markOrderShipped,
} from "@/services/order-delivery";

const buyerId = "00000000-0000-4000-8000-000000000001";
const sellerId = "00000000-0000-4000-8000-000000000003";
const orderId = "00000000-0000-4000-8000-000000000002";

describe("order delivery service", () => {
  beforeEach(() => {
    getCurrentUser.mockReset().mockResolvedValue({ id: buyerId });
    isCurrentUserSuspended.mockReset().mockResolvedValue(false);
    rpc.mockReset().mockResolvedValue({ data: orderId, error: null });
    notifyOrderDelivered.mockReset().mockResolvedValue(undefined);
    createSupabaseServerClient.mockReset().mockResolvedValue({ rpc });
  });

  it("allows the signed-in buyer to confirm by order ID only", async () => {
    await expect(confirmOrderDelivery(orderId)).resolves.toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("confirm_order_delivery", { p_order_id: orderId });
    expect(notifyOrderDelivered).toHaveBeenCalledWith(orderId);
  });

  it("keeps successful delivery confirmation successful if notifications fail", async () => {
    notifyOrderDelivered.mockRejectedValueOnce(new Error("notification insert failed"));
    await expect(confirmOrderDelivery(orderId)).resolves.toEqual({ success: true });
  });

  it("requires an authenticated user", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    await expect(confirmOrderDelivery(orderId)).resolves.toEqual({
      success: false,
      error: "Sign in to confirm delivery.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not accept a buyer ID or any additional browser-supplied fields", async () => {
    await expect(confirmOrderDelivery({ order_id: orderId, buyer_id: buyerId })).resolves.toMatchObject({
      success: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["unauthenticated RPC execution", "42501", "You are not authorized to confirm this order."],
    ["seller/unrelated buyer or order in paid, delivered, cancelled or refunded state", "22023", "This order is not available for delivery confirmation."],
  ])("safely rejects %s", async (_scenario, code, message) => {
    rpc.mockResolvedValueOnce({ data: null, error: { code } });
    await expect(confirmOrderDelivery(orderId)).resolves.toEqual({ success: false, error: message });
  });

  it("lists only the authenticated buyer's orders", async () => {
    const orderFilter = {
      data: [{
        id: orderId,
        amount: "12.50",
        status: "shipped",
        created_at: "2026-10-01T00:00:00.000Z",
        delivered_at: null,
      }],
      error: null,
      eq: vi.fn(),
      order: vi.fn(),
    };
    orderFilter.eq.mockReturnValue(orderFilter);
    orderFilter.order.mockResolvedValue(orderFilter);
    const select = vi.fn().mockReturnValue(orderFilter);
    const from = vi.fn(() => ({ select }));
    createSupabaseServerClient.mockResolvedValueOnce({ from });

    await expect(getBuyerOrders()).resolves.toEqual([{
      id: orderId,
      amount: 12.5,
      status: "shipped",
      createdAt: "2026-10-01T00:00:00.000Z",
      deliveredAt: null,
    }]);
    expect(orderFilter.eq).toHaveBeenCalledWith("buyer_id", buyerId);
  });

  it("lists only the authenticated seller's orders and exposes fulfillment-safe fields", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: sellerId });
    const ordersQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    };
    ordersQuery.select.mockReturnValue(ordersQuery);
    ordersQuery.eq.mockReturnValue(ordersQuery);
    ordersQuery.order.mockResolvedValue({
      data: [{
        id: orderId,
        listing_id: "00000000-0000-4000-8000-000000000004",
        amount: "12.50",
        status: "paid",
        created_at: "2026-10-01T00:00:00.000Z",
      }],
      error: null,
    });

    const listingsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
    };
    listingsQuery.select.mockReturnValue(listingsQuery);
    listingsQuery.eq.mockReturnValue(listingsQuery);
    listingsQuery.in.mockResolvedValue({
      data: [{
        id: "00000000-0000-4000-8000-000000000004",
        title: "Wool coat",
      }],
      error: null,
    });
    const from = vi.fn((table: string) => table === "orders"
      ? ordersQuery
      : listingsQuery);
    createSupabaseServerClient.mockResolvedValueOnce({ from });

    await expect(getSellerOrders()).resolves.toEqual([{
      id: orderId,
      listingId: "00000000-0000-4000-8000-000000000004",
      listingTitle: "Wool coat",
      amount: 12.5,
      status: "paid",
      createdAt: "2026-10-01T00:00:00.000Z",
    }]);
    expect(ordersQuery.eq).toHaveBeenCalledWith("seller_id", sellerId);
    expect(listingsQuery.eq).toHaveBeenCalledWith("seller_id", sellerId);
    expect(ordersQuery.select).toHaveBeenCalledWith("id, listing_id, amount, status, created_at");
  });

  it("does not retrieve another seller's orders when the authenticated seller has no sales", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: sellerId });
    const ordersQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    };
    ordersQuery.select.mockReturnValue(ordersQuery);
    ordersQuery.eq.mockReturnValue(ordersQuery);
    ordersQuery.order.mockResolvedValue({ data: [], error: null });
    const from = vi.fn(() => ordersQuery);
    createSupabaseServerClient.mockResolvedValueOnce({ from });

    await expect(getSellerOrders()).resolves.toEqual([]);
    expect(ordersQuery.eq).toHaveBeenCalledWith("seller_id", sellerId);
  });

  it("does not query orders as a suspended seller", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: sellerId });
    isCurrentUserSuspended.mockResolvedValueOnce(true);
    await expect(getSellerOrders()).resolves.toEqual([]);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("marks an order shipped using only its ID and an authenticated session", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: sellerId });
    await expect(markOrderShipped(orderId)).resolves.toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("mark_order_shipped", { p_order_id: orderId });
  });

  it("derives seller identity from the authenticated session and sends only the order ID", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: sellerId });
    await expect(markOrderShipped(orderId)).resolves.toEqual({ success: true });
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("mark_order_shipped", { p_order_id: orderId });
  });

  it.each([
    ["another seller's order", "22023", "This order is not available to mark as shipped."],
    ["an already shipped, delivered, cancelled, or refunded order", "22023", "This order is not available to mark as shipped."],
    ["a suspended seller", "42501", "You are not authorized to fulfill this order."],
  ])("rejects %s at the database boundary", async (_scenario, code, message) => {
    getCurrentUser.mockResolvedValueOnce({ id: sellerId });
    rpc.mockResolvedValueOnce({ data: null, error: { code } });
    await expect(markOrderShipped(orderId)).resolves.toEqual({ success: false, error: message });
  });

  it("does not call the shipment RPC for an unauthenticated or suspended seller", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    await expect(markOrderShipped(orderId)).resolves.toMatchObject({ success: false });
    getCurrentUser.mockResolvedValueOnce({ id: sellerId });
    isCurrentUserSuspended.mockResolvedValueOnce(true);
    await expect(markOrderShipped(orderId)).resolves.toEqual({
      success: false,
      error: "Your account cannot fulfill orders right now.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
