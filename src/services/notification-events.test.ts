import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, createNotification } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@/services/notifications", () => ({ createNotification }));

import {
  notifyMessageSent,
  notifyOrderDelivered,
  notifyPurchaseConfirmed,
} from "@/services/notification-events";

const buyerId = "00000000-0000-4000-8000-000000000001";
const sellerId = "00000000-0000-4000-8000-000000000002";
const messageId = "00000000-0000-4000-8000-000000000003";
const conversationId = "00000000-0000-4000-8000-000000000004";
const orderId = "00000000-0000-4000-8000-000000000005";

function setup(rows: Record<string, unknown>) {
  const from = vi.fn((table: string) => {
    const row = rows[table] as Record<string, unknown> | null ?? null;
    const filters: Array<[string, string]> = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((field: string, value: string) => {
        filters.push([field, value]);
        return query;
      }),
      maybeSingle: vi.fn(async () => ({
        data: row && filters.every(([field, value]) => row[field] === value) ? row : null,
        error: null,
      })),
    };
    return query;
  });
  createSupabaseAdminClient.mockReturnValue({ from });
  return from;
}

describe("notification event generation", () => {
  beforeEach(() => {
    createSupabaseAdminClient.mockReset();
    createNotification.mockReset().mockResolvedValue({ success: true });
  });

  it("derives the message recipient from the stored sender and conversation participants", async () => {
    const from = setup({
      messages: { id: messageId, conversation_id: conversationId, sender_id: buyerId },
      conversations: { id: conversationId, buyer_id: buyerId, seller_id: sellerId },
    });
    await notifyMessageSent(messageId);
    expect(from).toHaveBeenNthCalledWith(1, "messages");
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: sellerId,
      type: "message",
      eventId: messageId,
      relatedEntityType: "conversation",
      relatedEntityId: conversationId,
    }));
    expect(createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ recipientId: buyerId }));
  });

  it("notifies the buyer when the seller is the message sender", async () => {
    setup({
      messages: { id: messageId, conversation_id: conversationId, sender_id: sellerId },
      conversations: { id: conversationId, buyer_id: buyerId, seller_id: sellerId },
    });
    await notifyMessageSent(messageId);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ recipientId: buyerId, eventId: messageId }));
    expect(createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ recipientId: sellerId }));
  });

  it("notifies the authoritative seller for a confirmed purchase, not the buyer", async () => {
    setup({ orders: { id: orderId, buyer_id: buyerId, seller_id: sellerId, status: "paid", payment_provider: "payu", provider_checkout_id: "provider-checkout-id" } });
    await notifyPurchaseConfirmed("payu", "provider-checkout-id");
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: sellerId,
      type: "order",
      eventId: orderId,
      relatedEntityId: orderId,
    }));
    expect(createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ recipientId: buyerId }));
  });

  it("notifies seller and buyer after delivery using the stored order participants", async () => {
    setup({
      orders: { id: orderId, buyer_id: buyerId, seller_id: sellerId, amount: "125.50", status: "delivered" },
      payments: { order_id: orderId, amount: "125.50", status: "succeeded" },
    });
    await notifyOrderDelivered(orderId);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: sellerId,
      type: "delivery",
      eventId: orderId,
    }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: buyerId,
      type: "review",
      eventId: orderId,
    }));
  });

  it("does not generate delivery or review notifications for an undelivered order", async () => {
    setup({ orders: { id: orderId, buyer_id: buyerId, seller_id: sellerId, status: "shipped" } });
    await notifyOrderDelivered(orderId);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("does not notify review availability without succeeded payment", async () => {
    setup({
      orders: { id: orderId, buyer_id: buyerId, seller_id: sellerId, amount: "125.50", status: "delivered" },
    });
    await notifyOrderDelivered(orderId);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "delivery", recipientId: sellerId }));
    expect(createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ type: "review" }));
  });

  it("does not notify review availability when succeeded payment amount mismatches", async () => {
    setup({
      orders: { id: orderId, buyer_id: buyerId, seller_id: sellerId, amount: "125.50", status: "delivered" },
      payments: { order_id: orderId, amount: "125.49", status: "succeeded" },
    });
    await notifyOrderDelivered(orderId);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "delivery", recipientId: sellerId }));
    expect(createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ type: "review" }));
  });

  it("does not notify review availability when the order has already been reviewed", async () => {
    setup({
      orders: { id: orderId, buyer_id: buyerId, seller_id: sellerId, amount: "125.50", status: "delivered" },
      payments: { order_id: orderId, amount: "125.50", status: "succeeded" },
      reviews: { order_id: orderId },
    });
    await notifyOrderDelivered(orderId);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "delivery", recipientId: sellerId }));
    expect(createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ type: "review" }));
  });

  it("contains notification failures without throwing to the business operation", async () => {
    setup({ orders: { id: orderId, seller_id: sellerId, status: "paid" } });
    createNotification.mockRejectedValueOnce(new Error("database details"));
    await expect(notifyPurchaseConfirmed("payu", "provider-checkout-id")).resolves.toBeUndefined();
  });
});
