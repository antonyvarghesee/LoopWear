import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyPayUResponse } = vi.hoisted(() => ({ verifyPayUResponse: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/services/payu-verification", () => ({ verifyPayUResponse }));

import { handlePayUReturn } from "@/services/payu-return";
import { POST as failureReturn } from "@/app/payment/return/failure/route";
import { POST as successReturn } from "@/app/payment/return/success/route";

beforeEach(() => {
  verifyPayUResponse.mockReset();
});

function payUReturnRequest(): Request {
  return new Request("https://loopwear.example/payment/return/success", {
    method: "POST",
    body: new URLSearchParams({ txnid: "untrusted" }),
  });
}

describe("PayU return handler", () => {
  it("confirms a purchase only after server-side atomic verification succeeds", async () => {
    verifyPayUResponse.mockResolvedValueOnce({ status: "success" });
    const request = payUReturnRequest();
    expect(request.headers.get("cookie")).toBeNull();
    const response = await handlePayUReturn(request);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Purchase confirmed");
    expect(body).toContain("order is confirmed");
    expect(body).toContain("listing is sold");
    expect(body).not.toContain("has not confirmed your order");
  });

  it.each([
    [failureReturn, "failure"],
    [successReturn, "cancelled"],
  ])("renders the verified %s state without confirming a purchase", async (route, status) => {
    verifyPayUResponse.mockResolvedValueOnce({ status });
    const response = await route(payUReturnRequest());
    const body = await response.text();

    expect(body).toMatch(/Payment (?:not completed|cancelled)/);
    expect(body).toContain("has not confirmed your order");
  });

  it("explains that a verified payment requires manual refund reconciliation when the listing became ineligible", async () => {
    verifyPayUResponse.mockResolvedValueOnce({ status: "refund_required" });
    const response = await successReturn(payUReturnRequest());
    const body = await response.text();

    expect(body).toContain("Payment requires refund review");
    expect(body).toContain("contact LoopWear support to reconcile the payment");
    expect(body).toContain("has not confirmed your order");
    expect(body).not.toContain("listing is sold");
  });

  it("shows a generic verification error for invalid or replayed responses", async () => {
    verifyPayUResponse.mockResolvedValueOnce({ status: "invalid" });
    const invalid = await failureReturn(payUReturnRequest());
    expect(await invalid.text()).toContain("could not verify this payment response");

    verifyPayUResponse.mockResolvedValueOnce({ status: "duplicate" });
    const duplicate = await successReturn(payUReturnRequest());
    expect(await duplicate.text()).toContain("already been processed");
    expect(verifyPayUResponse).toHaveBeenCalledTimes(2);
  });

  it("does not verify GET requests or trust query parameters", async () => {
    const response = await handlePayUReturn(
      new Request("https://loopwear.example/payment/return/success?status=success"),
    );
    const body = await response.text();

    expect(verifyPayUResponse).not.toHaveBeenCalled();
    expect(body).toContain("Payment verification pending");
    expect(body).not.toContain("Payment received");
  });
});
