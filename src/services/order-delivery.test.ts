import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser, rpc, notifyOrderDelivered } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  rpc: vi.fn(),
  notifyOrderDelivered: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/auth", () => ({ getCurrentUser }));
vi.mock("@/services/notification-events", () => ({ notifyOrderDelivered }));

import { confirmOrderDelivery, getBuyerOrders } from "@/services/order-delivery";

const buyerId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000002";

describe("order delivery service", () => {
  beforeEach(() => {
    getCurrentUser.mockReset().mockResolvedValue({ id: buyerId });
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
});
