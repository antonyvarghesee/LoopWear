import "server-only";
import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WebhookProcessingResult =
  | { outcome: "ignored" | "processed" | "duplicate" }
  | { outcome: "rejected"; reason: string };

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function rejected(reason: string): WebhookProcessingResult {
  console.error("Stripe Checkout event rejected:", reason);
  return { outcome: "rejected", reason };
}

export async function processVerifiedStripeEvent(
  event: Stripe.Event,
): Promise<WebhookProcessingResult> {
  if (event.livemode) return rejected("live_mode_event");

  if (
    event.type !== "checkout.session.completed"
    && event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return { outcome: "ignored" };
  }

  const stripe = getStripeClient();
  const eventSession = event.data.object;
  const session = await stripe.checkout.sessions.retrieve(eventSession.id);

  if (session.livemode || session.mode !== "payment") {
    return rejected("invalid_session_mode");
  }
  if (session.payment_status !== "paid") {
    return { outcome: "ignored" };
  }

  const listingId = session.metadata?.listing_id;
  const buyerId = session.metadata?.buyer_id;
  const sellerId = session.metadata?.seller_id;
  if (!isUuid(listingId) || !isUuid(buyerId) || !isUuid(sellerId)) {
    return rejected("invalid_session_metadata");
  }

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!paymentIntentId || !session.amount_total || !session.currency) {
    return rejected("missing_payment_details");
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (
    paymentIntent.livemode
    || paymentIntent.status !== "succeeded"
    || paymentIntent.amount_received <= 0
  ) {
    return rejected("payment_not_succeeded");
  }
  if (
    paymentIntent.amount_received !== session.amount_total
    || paymentIntent.currency.toLowerCase() !== session.currency.toLowerCase()
  ) {
    return rejected("session_payment_mismatch");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("confirm_stripe_checkout_purchase", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_checkout_session_id: session.id,
    p_payment_intent_id: paymentIntent.id,
    p_listing_id: listingId,
    p_buyer_id: buyerId,
    p_seller_id: sellerId,
    p_amount_minor: paymentIntent.amount_received,
    p_currency: paymentIntent.currency,
  });

  if (error) {
    console.error("Atomic Stripe purchase confirmation failed:", error);
    throw new Error("Atomic purchase confirmation is temporarily unavailable.");
  }
  if (data === "processed") return { outcome: "processed" };
  if (data === "duplicate") return { outcome: "duplicate" };
  if (typeof data === "string" && data.startsWith("rejected_")) {
    return rejected(data);
  }

  console.error("Atomic Stripe purchase confirmation returned an unexpected result.");
  throw new Error("Atomic purchase confirmation is temporarily unavailable.");
}
