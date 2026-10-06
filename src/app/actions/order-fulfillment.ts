"use server";

import { revalidatePath } from "next/cache";
import { markOrderShipped } from "@/services/order-delivery";

export async function markOrderShippedAction(orderId: unknown) {
  try {
    const result = await markOrderShipped(orderId);
    revalidatePath("/dashboard/orders");
    return result;
  } catch {
    return { success: false, error: "The order could not be marked as shipped. Please try again." };
  }
}
