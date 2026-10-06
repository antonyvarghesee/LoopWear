import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CreateNotificationInput } from "@/lib/validations/notifications";
import { createNotification } from "@/services/notifications";

type ConfirmedOrder = {
  id: string;
  buyer_id: string;
  seller_id: string;
  amount: string | number;
  status: string;
};

function amountInMinorUnits(value: string | number): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return null;
  const amount = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

async function saveEventNotification(
  kind: string,
  input: CreateNotificationInput,
): Promise<void> {
  try {
    const result = await createNotification(input);
    if (!result.success) console.error(`Notification event generation failed: ${kind}.`);
  } catch {
    console.error(`Notification event generation failed: ${kind}.`);
  }
}

export async function notifyMessageSent(messageId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: message, error: messageError } = await admin
      .from("messages")
      .select("id, conversation_id, sender_id")
      .eq("id", messageId)
      .maybeSingle();
    if (messageError || !message) throw messageError ?? new Error("Message event not found.");

    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .select("id, buyer_id, seller_id")
      .eq("id", message.conversation_id)
      .maybeSingle();
    if (conversationError || !conversation) throw conversationError ?? new Error("Message conversation not found.");

    const recipientId = message.sender_id === conversation.buyer_id
      ? conversation.seller_id
      : message.sender_id === conversation.seller_id
        ? conversation.buyer_id
        : null;
    if (!recipientId) throw new Error("Message sender is not a conversation participant.");

    await saveEventNotification("message sent", {
      recipientId,
      type: "message",
      eventId: message.id,
      title: "New message",
      body: "You received a new message.",
      relatedEntityType: "conversation",
      relatedEntityId: conversation.id,
      linkUrl: `/messages/${conversation.id}`,
    });
  } catch {
    console.error("Notification event generation failed: message sent.");
  }
}

export async function notifyPurchaseConfirmed(
  paymentProvider: string,
  providerCheckoutId: string,
): Promise<void> {
  try {
    const { data: order, error } = await createSupabaseAdminClient()
      .from("orders")
      .select("id, seller_id, status")
      .eq("payment_provider", paymentProvider)
      .eq("provider_checkout_id", providerCheckoutId)
      .maybeSingle();
    if (error || !order || order.status !== "paid") {
      throw error ?? new Error("Confirmed purchase order not found.");
    }

    await saveEventNotification("purchase confirmed", {
      recipientId: order.seller_id,
      type: "order",
      eventId: order.id,
      title: "Your listing was purchased",
      body: "A buyer has purchased one of your listings.",
      relatedEntityType: "order",
      relatedEntityId: order.id,
      linkUrl: "/dashboard/orders",
    });
  } catch {
    console.error("Notification event generation failed: purchase confirmed.");
  }
}

export async function notifyOrderDelivered(orderId: string): Promise<void> {
  try {
    const { data: order, error } = await createSupabaseAdminClient()
      .from("orders")
      .select("id, buyer_id, seller_id, amount, status")
      .eq("id", orderId)
      .maybeSingle() as { data: ConfirmedOrder | null; error: unknown };
    if (error || !order || order.status !== "delivered") {
      throw error ?? new Error("Delivered order not found.");
    }

    await saveEventNotification("delivery confirmed", {
      recipientId: order.seller_id,
      type: "delivery",
      eventId: order.id,
      title: "Delivery confirmed",
      body: "The buyer confirmed receiving the item.",
      relatedEntityType: "order",
      relatedEntityId: order.id,
      linkUrl: "/dashboard/orders",
    });

    const admin = createSupabaseAdminClient();
    const [{ data: payment, error: paymentError }, { data: review, error: reviewError }] = await Promise.all([
      admin.from("payments")
        .select("order_id, amount")
        .eq("order_id", order.id)
        .eq("status", "succeeded")
        .maybeSingle(),
      admin.from("reviews")
        .select("order_id")
        .eq("order_id", order.id)
        .maybeSingle(),
    ]);
    if (paymentError || reviewError) throw paymentError ?? reviewError;
    if (
      payment
      && amountInMinorUnits(order.amount) !== null
      && amountInMinorUnits(order.amount) === amountInMinorUnits(payment.amount)
      && !review
    ) {
      await saveEventNotification("review available", {
        recipientId: order.buyer_id,
        type: "review",
        eventId: order.id,
        title: "Share your experience",
        body: "Your purchase is delivered. Leave a review for the seller.",
        relatedEntityType: "order",
        relatedEntityId: order.id,
        linkUrl: "/dashboard/orders",
      });
    }
  } catch {
    console.error("Notification event generation failed: delivery confirmed.");
  }
}
