import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth";
import { notifyOrderDelivered } from "@/services/notification-events";

const orderIdSchema = z.string().uuid();

export type BuyerOrder = {
  id: string;
  amount: number;
  status: "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "refunded";
  createdAt: string;
  deliveredAt: string | null;
};

export type DeliveryConfirmationResult =
  | { success: true }
  | { success: false; error: string };

export async function getBuyerOrders(): Promise<BuyerOrder[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, amount, status, created_at, delivered_at")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Buyer order lookup failed.");
    throw new Error("Your orders are temporarily unavailable.");
  }

  return (data ?? []).map((order) => ({
    id: order.id,
    amount: Number(order.amount),
    status: order.status,
    createdAt: order.created_at,
    deliveredAt: order.delivered_at,
  })) as BuyerOrder[];
}

export async function confirmOrderDelivery(input: unknown): Promise<DeliveryConfirmationResult> {
  const parsedOrderId = orderIdSchema.safeParse(input);
  if (!parsedOrderId.success) {
    return { success: false, error: "This order cannot be confirmed as delivered." };
  }

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Sign in to confirm delivery." };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("confirm_order_delivery", {
      p_order_id: parsedOrderId.data,
    });

    if (error?.code === "22023") {
      return { success: false, error: "This order is not available for delivery confirmation." };
    }
    if (error?.code === "42501") {
      return { success: false, error: "You are not authorized to confirm this order." };
    }
    if (error) throw error;
    if (typeof data === "string") {
      try {
        await notifyOrderDelivered(data);
      } catch {
        console.error("Notification event generation failed: delivery confirmed.");
      }
    }
    return { success: true };
  } catch {
    console.error("Order delivery confirmation failed.");
    return { success: false, error: "Delivery confirmation failed. Please try again." };
  }
}
