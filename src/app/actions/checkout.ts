"use server";

import { createCheckoutSession } from "@/services/checkout";

export async function createCheckoutSessionAction(listingId: string) {
  return createCheckoutSession(listingId);
}
