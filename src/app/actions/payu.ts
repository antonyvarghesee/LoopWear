"use server";

import { initiatePayUPayment } from "@/services/payu";

export async function initiatePayUPaymentAction(listingId: string) {
  return initiatePayUPayment(listingId);
}
