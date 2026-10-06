import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth";
import { isCurrentUserSuspended } from "@/services/moderation-enforcement";
import { notifyOrderDelivered } from "@/services/notification-events";

const orderIdSchema = z.string().uuid();

export type BuyerOrder = {
  id: string;
  amount: number;
  status: "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "refunded";
  createdAt: string;
  deliveredAt: string | null;
};

export type SellerOrder = {
  id: string;
  listingId: string;
  listingTitle: string;
  amount: number;
  status: BuyerOrder["status"];
  createdAt: string;
};

export type DeliveryConfirmationResult =
  | { success: true }
  | { success: false; error: string };

export type ShipmentResult =
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

export async function getSellerOrders(): Promise<SellerOrder[]> {
  const user = await getCurrentUser();
  if (!user || await isCurrentUserSuspended()) return [];

  const supabase = await createSupabaseServerClient();
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, listing_id, amount, status, created_at")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  if (ordersError) {
    console.error("Seller order lookup failed.");
    throw new Error("Your sales are temporarily unavailable.");
  }
  if (!orders?.length) return [];

  const listingIds = [...new Set(orders.map((order) => order.listing_id))];
  const { data: listings, error: listingsError } = await supabase
    .from("listings")
    .select("id, title")
    .eq("seller_id", user.id)
    .in("id", listingIds);

  if (listingsError) {
    console.error("Seller order listing lookup failed.");
    throw new Error("Your sales are temporarily unavailable.");
  }

  const listingTitles = new Map((listings ?? []).map((listing) => [listing.id, listing.title]));
  return orders.flatMap((order) => {
    const listingTitle = listingTitles.get(order.listing_id);
    if (!listingTitle) return [];
    return [{
      id: order.id,
      listingId: order.listing_id,
      listingTitle,
      amount: Number(order.amount),
      status: order.status,
      createdAt: order.created_at,
    }];
  }) as SellerOrder[];
}

export async function markOrderShipped(input: unknown): Promise<ShipmentResult> {
  const parsedOrderId = orderIdSchema.safeParse(input);
  if (!parsedOrderId.success) {
    return { success: false, error: "This order cannot be marked as shipped." };
  }

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Sign in to manage your sales." };

  try {
    if (await isCurrentUserSuspended()) {
      return { success: false, error: "Your account cannot fulfill orders right now." };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("mark_order_shipped", {
      p_order_id: parsedOrderId.data,
    });

    if (error?.code === "22023") {
      return { success: false, error: "This order is not available to mark as shipped." };
    }
    if (error?.code === "42501") {
      return { success: false, error: "You are not authorized to fulfill this order." };
    }
    if (error) throw error;
    return { success: true };
  } catch {
    console.error("Order shipment update failed.");
    return { success: false, error: "The order could not be marked as shipped. Please try again." };
  }
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
