import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  retrieveSession,
  retrievePaymentIntent,
  rpc,
} = vi.hoisted(() => ({
  retrieveSession: vi.fn(),
  retrievePaymentIntent: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}));
vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = { sessions: { retrieve: retrieveSession } };
    paymentIntents = { retrieve: retrievePaymentIntent };
    webhooks = { constructEvent: vi.fn() };

    constructor() {}
  },
}));

import { processVerifiedStripeEvent } from "@/services/stripe-webhook";
import type Stripe from "stripe";

const eventId = "evt_test_123";
const sessionId = "cs_test_123";
const paymentIntentId = "pi_test_123";
const listingId = "00000000-0000-4000-8000-000000000003";
const buyerId = "00000000-0000-4000-8000-000000000001";
const sellerId = "00000000-0000-4000-8000-000000000002";

function checkoutEvent(
  type: "checkout.session.completed" | "checkout.session.async_payment_succeeded" = "checkout.session.completed",
): Stripe.Event {
  return {
    id: eventId,
    type,
    livemode: false,
    data: { object: { id: sessionId } },
  } as Stripe.Event;
}

function configureSuccessfulPayment() {
  retrieveSession.mockResolvedValue({
    id: sessionId,
    livemode: false,
    mode: "payment",
    payment_status: "paid",
    amount_total: 12995,
    currency: "usd",
    payment_intent: paymentIntentId,
    metadata: { listing_id: listingId, buyer_id: buyerId, seller_id: sellerId },
  });
  retrievePaymentIntent.mockResolvedValue({
    id: paymentIntentId,
    livemode: false,
    status: "succeeded",
    amount_received: 12995,
    currency: "usd",
  });
  rpc.mockResolvedValue({ data: "processed", error: null });
}

describe("verified Stripe Checkout webhook processing", () => {
  beforeEach(() => {
    retrieveSession.mockReset();
    retrievePaymentIntent.mockReset();
    rpc.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_webhook_secret");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("retrieves the session and payment from Stripe, then creates the purchase through the atomic RPC", async () => {
    configureSuccessfulPayment();

    expect(await processVerifiedStripeEvent(checkoutEvent())).toEqual({ outcome: "processed" });
    expect(retrieveSession).toHaveBeenCalledWith(sessionId);
    expect(retrievePaymentIntent).toHaveBeenCalledWith(paymentIntentId);
    expect(rpc).toHaveBeenCalledWith("confirm_stripe_checkout_purchase", {
      p_event_id: eventId,
      p_event_type: "checkout.session.completed",
      p_checkout_session_id: sessionId,
      p_payment_intent_id: paymentIntentId,
      p_listing_id: listingId,
      p_buyer_id: buyerId,
      p_seller_id: sellerId,
      p_amount_minor: 12995,
      p_currency: "usd",
    });
  });

  it("rejects a live-mode event without creating a purchase", async () => {
    const event = { ...checkoutEvent(), livemode: true } as Stripe.Event;

    expect(await processVerifiedStripeEvent(event)).toMatchObject({ outcome: "rejected" });
    expect(retrieveSession).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["checkout.session.expired", "checkout.session.async_payment_failed"])(
    "does not process a cancelled or failed checkout (%s)",
    async (type) => {
      const event = { ...checkoutEvent(), type } as Stripe.Event;

      expect(await processVerifiedStripeEvent(event)).toEqual({ outcome: "ignored" });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("does not process a completed session while Stripe reports it unpaid", async () => {
    retrieveSession.mockResolvedValue({
      id: sessionId,
      livemode: false,
      mode: "payment",
      payment_status: "unpaid",
    });

    expect(await processVerifiedStripeEvent(checkoutEvent())).toEqual({ outcome: "ignored" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an amount mismatch between the Checkout Session and PaymentIntent", async () => {
    configureSuccessfulPayment();
    retrievePaymentIntent.mockResolvedValue({
      id: paymentIntentId,
      livemode: false,
      status: "succeeded",
      amount_received: 12994,
      currency: "usd",
    });

    expect(await processVerifiedStripeEvent(checkoutEvent())).toMatchObject({ outcome: "rejected" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a currency mismatch between the Checkout Session and PaymentIntent", async () => {
    configureSuccessfulPayment();
    retrievePaymentIntent.mockResolvedValue({
      id: paymentIntentId,
      livemode: false,
      status: "succeeded",
      amount_received: 12995,
      currency: "eur",
    });

    expect(await processVerifiedStripeEvent(checkoutEvent())).toMatchObject({ outcome: "rejected" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["a nonexistent listing", "rejected_listing_missing"],
    ["a self-purchase", "rejected_participants"],
    ["a duplicate payment identifier", "rejected_payment_identifier_reused"],
    ["a listing that is already sold", "rejected_listing_not_active"],
    ["a database amount or currency mismatch", "rejected_amount_or_currency"],
  ])("returns a rejected outcome for %s", async (_scenario, databaseOutcome) => {
    configureSuccessfulPayment();
    rpc.mockResolvedValue({ data: databaseOutcome, error: null });

    expect(await processVerifiedStripeEvent(checkoutEvent())).toEqual({
      outcome: "rejected",
      reason: databaseOutcome,
    });
  });

  it("treats repeated Stripe event delivery as idempotent", async () => {
    configureSuccessfulPayment();
    rpc.mockResolvedValue({ data: "duplicate", error: null });

    expect(await processVerifiedStripeEvent(checkoutEvent())).toEqual({ outcome: "duplicate" });
  });

  it("does not confirm a PaymentIntent that Stripe reports as not succeeded", async () => {
    configureSuccessfulPayment();
    retrievePaymentIntent.mockResolvedValue({
      id: paymentIntentId,
      livemode: false,
      status: "processing",
      amount_received: 0,
      currency: "usd",
    });

    expect(await processVerifiedStripeEvent(checkoutEvent())).toMatchObject({ outcome: "rejected" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
