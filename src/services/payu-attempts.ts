import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
