import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { validatePurchase, stripeConstructor, createSession } = vi.hoisted(() => ({
  validatePurchase: vi.fn(),
  stripeConstructor: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/purchases", () => ({ validatePurchase }));
vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = { sessions: { create: createSession } };

    constructor(secretKey: string) {
      stripeConstructor(secretKey);
    }
  },
}));

import { createCheckoutSession } from "@/services/checkout";
import { createCheckoutSessionAction } from "@/app/actions/checkout";

const buyerId = "00000000-0000-4000-8000-000000000001";
const sellerId = "00000000-0000-4000-8000-000000000002";
const listingId = "00000000-0000-4000-8000-000000000003";
const secretKey = "sk_test_fake_secret";

function validPurchase(sellingPrice = "129.95") {
  return {
    success: true as const,
    data: { buyerId, listingId, sellerId, title: "Wool coat", sellingPrice },
  };
}

function validPurchaseTwice(sellingPrice = "129.95") {
  validatePurchase
    .mockResolvedValueOnce(validPurchase(sellingPrice))
    .mockResolvedValueOnce(validPurchase(sellingPrice));
}

describe("Stripe Checkout Session creation", () => {
  beforeEach(() => {
    validatePurchase.mockReset();
    stripeConstructor.mockReset();
    createSession.mockReset().mockResolvedValue({ url: "https://checkout.stripe.test/session" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("STRIPE_SECRET_KEY", secretKey);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://loopwear.test");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects an unauthenticated buyer", async () => {
    validatePurchase.mockResolvedValue({
      success: false,
      error: "Sign in to purchase this listing.",
    });

    expect(await createCheckoutSession(listingId)).toEqual({
      success: false,
      error: "Sign in to purchase this listing.",
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects a seller purchasing their own listing", async () => {
    validatePurchase.mockResolvedValue({
      success: false,
      error: "You cannot purchase your own listing.",
    });

    expect(await createCheckoutSession(listingId)).toMatchObject({ success: false });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects an inactive listing", async () => {
    validatePurchase.mockResolvedValue({
      success: false,
      error: "This listing is not available for purchase.",
    });

    expect(await createCheckoutSession(listingId)).toMatchObject({ success: false });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("uses the database price rather than client-provided values", async () => {
    validPurchaseTwice("19.50");

    await Reflect.apply(createCheckoutSessionAction, undefined, [listingId, { price: 0.01 }]);

    expect(validatePurchase).toHaveBeenNthCalledWith(1, listingId);
    expect(validatePurchase).toHaveBeenNthCalledWith(2, listingId);
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [
        expect.objectContaining({
          price_data: expect.objectContaining({ unit_amount: 1950 }),
          quantity: 1,
        }),
      ],
    }));
  });

  it("sends payment mode, one quantity-one line item, and only required internal metadata", async () => {
    validPurchaseTwice();

    await createCheckoutSession(listingId);

    expect(createSession).toHaveBeenCalledOnce();
    const sessionOptions = createSession.mock.calls[0]?.[0];
    if (!sessionOptions) throw new Error("Expected Stripe Checkout options.");
    expect(sessionOptions).toMatchObject({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Wool coat" },
            unit_amount: 12995,
          },
          quantity: 1,
        },
      ],
      success_url: "https://loopwear.test/?checkout=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://loopwear.test/?checkout=cancelled",
      metadata: { listing_id: listingId, buyer_id: buyerId },
    });
    expect(Object.keys(sessionOptions.metadata ?? {})).toEqual(["listing_id", "buyer_id"]);
    expect(sessionOptions.line_items).toHaveLength(1);
  });

  it("checks that the listing remains active immediately before creating the session", async () => {
    validatePurchase
      .mockResolvedValueOnce(validPurchase())
      .mockResolvedValueOnce({
        success: false,
        error: "This listing is not available for purchase.",
      });

    expect(await createCheckoutSession(listingId)).toMatchObject({ success: false });
    expect(validatePurchase).toHaveBeenCalledTimes(2);
    expect(createSession).not.toHaveBeenCalled();
  });

  it.each([
    ["STRIPE_SECRET_KEY", undefined],
    ["STRIPE_SECRET_KEY", "sk_live_not_allowed"],
    ["NEXT_PUBLIC_APP_URL", undefined],
    ["NEXT_PUBLIC_APP_URL", "not-a-url"],
  ])("fails safely when %s is missing or invalid", async (key, value) => {
    validPurchaseTwice();
    vi.stubEnv(key, value);

    const result = await createCheckoutSession(listingId);

    expect(result).toEqual({
      success: false,
      error: "Checkout is temporarily unavailable. Please try again.",
    });
    expect(JSON.stringify(result)).not.toContain("sk_test_fake_secret");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("does not expose Stripe errors or credentials to the caller or logs", async () => {
    validPurchaseTwice();
    createSession.mockRejectedValue(new Error(`Request failed using ${secretKey}`));

    const result = await createCheckoutSession(listingId);

    expect(result).toEqual({
      success: false,
      error: "Checkout is temporarily unavailable. Please try again.",
    });
    expect(JSON.stringify(result)).not.toContain(secretKey);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secretKey);
  });
});
