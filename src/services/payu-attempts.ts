import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notifyPurchaseConfirmed } from "@/services/notification-events";

export type PayUPaymentAttempt = {
  payment_provider: string;
  provider_transaction_id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: string | number;
  currency: string;
  productinfo: string;
  firstname: string;
  email: string;
  response_state: string;
  current_selling_price: string | number | null;
};

export type PayUConfirmationResult =
  | "processed"
  | "duplicate_confirmed"
  | "rejected";

export async function getPayUPaymentAttempt(
  transactionId: string,
): Promise<PayUPaymentAttempt | null> {
  const { data, error } = await createSupabaseAdminClient().rpc(
    "get_provider_checkout_attempt",
    {
      p_payment_provider: "payu",
      p_provider_transaction_id: transactionId,
    },
  );
  if (error) throw error;
  return Array.isArray(data) ? (data[0] as PayUPaymentAttempt | undefined) ?? null : null;
}

export async function confirmPayUPaymentAttempt(
  attempt: PayUPaymentAttempt,
): Promise<PayUConfirmationResult> {
  const amount = String(attempt.amount);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return "rejected";
  const amountMinor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return "rejected";

  const { data, error } = await createSupabaseAdminClient().rpc(
    "confirm_provider_purchase",
    {
      p_payment_provider: "payu",
      p_event_id: attempt.provider_transaction_id,
      p_event_type: "payu.payment.success",
      p_provider_checkout_id: attempt.provider_transaction_id,
      p_provider_payment_id: attempt.provider_transaction_id,
      p_listing_id: attempt.listing_id,
      p_buyer_id: attempt.buyer_id,
      p_seller_id: attempt.seller_id,
      p_amount_minor: amountMinor,
      p_currency: "inr",
    },
  );
  if (error) throw error;
  if (data === "processed" || data === "duplicate_confirmed") {
    try {
      await notifyPurchaseConfirmed("payu", attempt.provider_transaction_id);
    } catch {
      console.error("Notification event generation failed: purchase confirmed.");
    }
    return data;
  }
  return "rejected";
}

export async function consumePayUPaymentAttempt(
  transactionId: string,
  verifiedState: "verified_success" | "verified_failure" | "verified_cancelled",
): Promise<"consumed" | "duplicate" | "invalid"> {
  const { data, error } = await createSupabaseAdminClient().rpc(
    "consume_provider_checkout_attempt",
    {
      p_payment_provider: "payu",
      p_provider_transaction_id: transactionId,
      p_response_state: verifiedState,
    },
  );
  if (error) throw error;
  if (data === "consumed" || data === "duplicate") return data;
  return "invalid";
}
