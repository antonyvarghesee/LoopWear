import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { validatePurchase, getCurrentUser, rpc } = vi.hoisted(() => ({
  validatePurchase: vi.fn(),
  getCurrentUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/purchases", () => ({ validatePurchase }));
vi.mock("@/services/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}));

import { createPayURequestHash, initiatePayUPayment } from "@/services/payu";
import { initiatePayUPaymentAction } from "@/app/actions/payu";

const buyerId = "00000000-0000-4000-8000-000000000001";
const sellerId = "00000000-0000-4000-8000-000000000002";
const listingId = "00000000-0000-4000-8000-000000000003";
const merchantKey = "test-merchant-key";
const merchantSalt = "test-merchant-salt";

function successfulPurchase(sellingPrice = "129.95") {
  return {
    success: true as const,
    data: { buyerId, listingId, sellerId, title: "Wool coat", sellingPrice },
  };
}

describe("PayU Test/UAT payment initiation", () => {
  beforeEach(() => {
    validatePurchase.mockReset().mockResolvedValue(successfulPurchase());
    rpc.mockReset().mockResolvedValue({ data: null, error: null });
    getCurrentUser.mockReset().mockResolvedValue({
      id: buyerId,
      email: "buyer@example.test",
      phone: "+919876543210",
      phone_confirmed_at: "2026-10-06T00:00:00.000Z",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("PAYU_MERCHANT_KEY", merchantKey);
    vi.stubEnv("PAYU_MERCHANT_SALT", merchantSalt);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://loopwear.example");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects unauthenticated buyers through existing purchase validation", async () => {
    validatePurchase.mockResolvedValue({
      success: false,
      error: "Sign in to purchase this listing.",
    });

    expect(await initiatePayUPayment(listingId)).toEqual({
      success: false,
      error: "Sign in to purchase this listing.",
    });
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("rejects a nonexistent listing", async () => {
    validatePurchase.mockResolvedValue({
      success: false,
      error: "This listing could not be found.",
    });

    expect(await initiatePayUPayment(listingId)).toMatchObject({ success: false });
  });

  it("rejects an inactive listing", async () => {
    validatePurchase.mockResolvedValue({
      success: false,
      error: "This listing is not available for purchase.",
    });

    expect(await initiatePayUPayment(listingId)).toMatchObject({ success: false });
  });

  it("rejects a seller purchasing their own listing", async () => {
    validatePurchase.mockResolvedValue({
      success: false,
      error: "You cannot purchase your own listing.",
    });

    expect(await initiatePayUPayment(listingId)).toMatchObject({ success: false });
  });

  it("uses only the listing ID and derives the amount from purchase validation", async () => {
    validatePurchase.mockResolvedValue(successfulPurchase("450.5"));

    const result = await Reflect.apply(initiatePayUPaymentAction, undefined, [
      listingId,
      { amount: "1.00", buyerId: "attacker", sellerId: "attacker" },
    ]);

    expect(validatePurchase).toHaveBeenCalledOnce();
    expect(validatePurchase).toHaveBeenCalledWith(listingId);
    expect(result).toMatchObject({
      success: true,
      fields: { amount: "450.50" },
    });
  });

  it("uses India Test/UAT INR amount formatting without adding an undocumented currency field", async () => {
    const result = await initiatePayUPayment(listingId);

    expect(result).toMatchObject({
      success: true,
      endpoint: "https://test.payu.in/_payment",
      currency: "INR",
      fields: { amount: "129.95", phone: "919876543210", api_version: "7" },
    });
    if (!result.success) throw new Error("Expected valid PayU initiation result.");
    expect(result.fields).not.toHaveProperty("currency");
  });

  it("requires a confirmed authenticated user phone and sends that validated phone", async () => {
    getCurrentUser.mockResolvedValueOnce({
      id: buyerId,
      email: "buyer@example.test",
      phone: "+91 98765-43210",
      phone_confirmed_at: "2026-10-06T00:00:00.000Z",
    });
    const result = await initiatePayUPayment(listingId);
    expect(result).toMatchObject({ success: true, fields: { phone: "919876543210" } });

    getCurrentUser.mockResolvedValueOnce({
      id: buyerId,
      email: "buyer@example.test",
      phone: "+919876543210",
      phone_confirmed_at: null,
    });
    expect(await initiatePayUPayment(listingId)).toMatchObject({ success: false });

    getCurrentUser.mockResolvedValueOnce({
      id: buyerId,
      email: "buyer@example.test",
      phone: "not-a-phone",
      phone_confirmed_at: "2026-10-06T00:00:00.000Z",
    });
    expect(await initiatePayUPayment(listingId)).toMatchObject({ success: false });
  });

  it("generates a unique cryptographically random transaction reference", async () => {
    const first = await initiatePayUPayment(listingId);
    const second = await initiatePayUPayment(listingId);
    if (!first.success || !second.success) throw new Error("Expected valid PayU initiation results.");

    expect(first.fields.txnid).toMatch(/^[a-f0-9]{24}$/);
    expect(second.fields.txnid).toMatch(/^[a-f0-9]{24}$/);
    expect(first.fields.txnid).not.toBe(second.fields.txnid);
    expect(readFileSync(join(process.cwd(), "src/services/payu.ts"), "utf8")).toMatch(/randomBytes\(12\)/);
  });

  it("sends only required internal identifiers in UDF metadata and never returns the merchant salt", async () => {
    const result = await initiatePayUPayment(listingId);
    if (!result.success) throw new Error("Expected valid PayU initiation result.");

    expect(result.fields).toMatchObject({
      udf1: listingId,
      udf2: buyerId,
      udf3: sellerId,
      udf4: "",
      udf5: "",
    });
    expect(JSON.stringify(result)).not.toContain(merchantSalt);
    expect(result.fields).not.toHaveProperty("salt");
    const clientButton = readFileSync(
      join(process.cwd(), "src/components/listings/buy-now-button.tsx"),
      "utf8",
    );
    expect(clientButton).not.toMatch(/PAYU_MERCHANT_SALT|merchantSalt|salt/i);

    expect(result.fields.hash).toBe(createPayURequestHash(result.fields, merchantSalt));
    const expectedHashInput = [
      merchantKey, result.fields.txnid, result.fields.amount, result.fields.productinfo,
      result.fields.firstname, result.fields.email, listingId, buyerId, sellerId,
      "", "", "", "", "", "", "", merchantSalt,
    ].join("|");
    expect(result.fields.hash).toBe(createHash("sha512").update(expectedHashInput).digest("hex"));
  });

  it.each([
    ["PAYU_MERCHANT_KEY", undefined],
    ["PAYU_MERCHANT_SALT", undefined],
    ["NEXT_PUBLIC_APP_URL", undefined],
    ["NEXT_PUBLIC_APP_URL", "invalid-url"],
  ])("fails safely when %s is missing or invalid", async (key, value) => {
    vi.stubEnv(key, value);

    const result = await initiatePayUPayment(listingId);

    expect(result).toEqual({
      success: false,
      error: "PayU checkout is temporarily unavailable. Please try again.",
    });
    expect(JSON.stringify(result)).not.toContain(merchantSalt);
  });

  it("does not create orders or payment records during initiation", async () => {
    const result = await initiatePayUPayment(listingId);
    const implementation = readFileSync(join(process.cwd(), "src/services/payu.ts"), "utf8");

    expect(result.success).toBe(true);
    expect(validatePurchase).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("register_provider_checkout_attempt", expect.any(Object));
    expect(implementation).not.toMatch(/from\(["']orders["']\)|from\(["']payments["']\)/);
    expect(implementation).not.toMatch(/status\s*=\s*["']SOLD/);
  });

  it("uses valid distinct success and failure return URLs derived from NEXT_PUBLIC_APP_URL", async () => {
    const result = await initiatePayUPayment(listingId);
    if (!result.success) throw new Error("Expected valid PayU initiation result.");

    expect(result.fields.surl).toBe("https://loopwear.example/payment/return/success");
    expect(result.fields.furl).toBe("https://loopwear.example/payment/return/failure");
    expect(new URL(result.fields.surl).origin).toBe("https://loopwear.example");
    expect(new URL(result.fields.furl).origin).toBe("https://loopwear.example");
  });

  it("keeps listings active during payment initiation", async () => {
    const result = await initiatePayUPayment(listingId);
    const implementation = readFileSync(join(process.cwd(), "src/services/payu.ts"), "utf8");

    expect(result.success).toBe(true);
    expect(implementation).toContain("validatePurchase");
    expect(implementation).not.toMatch(/status\s*=\s*["']SOLD/);
    expect(implementation).not.toMatch(/from\(["']listings["']\)/);
  });
});
