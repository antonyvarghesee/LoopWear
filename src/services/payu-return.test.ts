import { describe, expect, it, vi } from "vitest";
import { handlePayUReturn } from "@/services/payu-return";
import { POST as failureReturn } from "@/app/payment/return/failure/route";
import { POST as successReturn } from "@/app/payment/return/success/route";

vi.mock("server-only", () => ({}));

describe("PayU temporary return handler", () => {
  it("reports pending verification and does not claim payment success", async () => {
    const response = handlePayUReturn();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Payment verification pending");
    expect(body).toContain("has not been verified yet");
    expect(body).not.toMatch(/payment (?:was )?successful|order confirmed/i);
  });

  it.each([successReturn, failureReturn])("does not trust status values posted by PayU's browser return", async (route) => {
    const response = await route();
    const body = await response.text();

    expect(body).toContain("Payment verification pending");
    expect(body).toContain("has not been verified yet");
    expect(body).not.toMatch(/payment (?:was )?successful|order confirmed/i);
  });
});
