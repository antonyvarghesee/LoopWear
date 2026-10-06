import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { constructEvent, processVerifiedStripeEvent } = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  processVerifiedStripeEvent: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent },
  }),
}));
vi.mock("@/services/stripe-webhook", () => ({ processVerifiedStripeEvent }));

import { POST } from "@/app/api/stripe/webhook/route";

describe("Stripe webhook route", () => {
  beforeEach(() => {
    constructEvent.mockReset();
    processVerifiedStripeEvent.mockReset();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects an invalid signature", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
    const request = new Request("https://loopwear.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "invalid" },
      body: "raw stripe payload",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(processVerifiedStripeEvent).not.toHaveBeenCalled();
  });

  it("rejects a missing Stripe signature", async () => {
    const response = await POST(new Request("https://loopwear.test/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("verifies the raw body and acknowledges a valid webhook", async () => {
    const event = { id: "evt_test" };
    constructEvent.mockReturnValue(event);
    processVerifiedStripeEvent.mockResolvedValue({ outcome: "processed" });
    const rawBody = '{"id":"evt_test","type":"checkout.session.completed"}';
    const request = new Request("https://loopwear.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "signature" },
      body: rawBody,
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(constructEvent).toHaveBeenCalledWith(rawBody, "signature", "whsec_test_secret");
    expect(processVerifiedStripeEvent).toHaveBeenCalledWith(event);
    await expect(response.json()).resolves.toEqual({ received: true, outcome: "processed" });
  });

  it("returns a retryable server error when atomic database confirmation fails", async () => {
    constructEvent.mockReturnValue({ id: "evt_test" });
    processVerifiedStripeEvent.mockRejectedValue(new Error("database unavailable"));
    const request = new Request("https://loopwear.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "signature" },
      body: "{}",
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
  });
});
