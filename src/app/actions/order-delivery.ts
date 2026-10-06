"use server";

import { revalidatePath } from "next/cache";
import { confirmOrderDelivery } from "@/services/order-delivery";

export async function confirmOrderDeliveryAction(orderId: unknown) {
  try {
    const result = await confirmOrderDelivery(orderId);
    if (!result.success) return result;

    revalidatePath("/dashboard/orders");
    revalidatePath("/seller/[username]", "page");
    return result;
  } catch {
    return { success: false, error: "Delivery confirmation failed. Please try again." };
  }
}
