import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { getPayUPaymentAttempt, consumePayUPaymentAttempt } = vi.hoisted(() => ({
  getPayUPaymentAttempt: vi.fn(),
  consumePayUPaymentAttempt: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/payu-attempts", () => ({
  getPayUPaymentAttempt,
  consumePayUPaymentAttempt,
}));

import {
  createPayUResponseHash,
  verifyPayUResponse,
} from "@/services/payu-verification";

const buyerId = "00000000-0000-4000-8000-000000000001";
const sellerId = "00000000-0000-4000-8000-000000000002";
const listingId = "00000000-0000-4000-8000-000000000003";
const merchantKey = "test-merchant-key";
const merchantSalt = "test-merchant-salt";
const transactionId = "0123456789abcdef01234567";

function responseFields(status = "success") {
  return {
    key: merchantKey,
    txnid: transactionId,
    amount: "129.95",
    productinfo: "Wool coat",
    firstname: "LoopWear",
    email: "buyer@example.test",
    status,
    udf1: listingId,
    udf2: buyerId,
    udf3: sellerId,
    udf4: "",
    udf5: "",
    hash: "",
  };
}

function trustedAttempt(response = responseFields()) {
  return {
    payment_provider: "payu",
    provider_transaction_id: transactionId,
    listing_id: listingId,
    buyer_id: buyerId,
    seller_id: sellerId,
    amount: "129.95",
    currency: "inr",
    productinfo: response.productinfo,
    firstname: response.firstname,
    email: response.email,
    response_state: "pending",
    current_selling_price: "129.95",
  };
}

function signedResponse(status = "success") {
  const fields = responseFields(status);
  fields.hash = createPayUResponseHash(fields, merchantSalt);
  return fields;
}

describe("PayU response hash and verification", () => {
  beforeEach(() => {
    vi.stubEnv("PAYU_MERCHANT_KEY", merchantKey);
    vi.stubEnv("PAYU_MERCHANT_SALT", merchantSalt);
    getPayUPaymentAttempt.mockReset().mockResolvedValue(trustedAttempt());
    consumePayUPaymentAttempt.mockReset().mockResolvedValue("consumed");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("matches PayU's documented regular reverse-hash vector", () => {
    const fields = {
      key: "merchant-key",
      txnid: transactionId,
      amount: "129.95",
      productinfo: "Wool coat",
      firstname: "LoopWear",
      email: "buyer@example.test",
      status: "success",
      udf1: "listing-123",
      udf2: "buyer-456",
      udf3: "seller-789",
      udf4: "",
      udf5: "",
    };

    expect(createPayUResponseHash(fields, "salt-test")).toBe(
      "59e0b53f352fba504b90343ef8ce055a35bc44d6a2e70a891cfdbc48cb87f1862805091ef44576ecd42b6b1ddfe0c93970e7e82cac96e22514987a14d16144a2",
    );
  });

  it("accepts a valid signed response from its persisted attempt without a browser auth session", async () => {
    const response = signedResponse();

    await expect(verifyPayUResponse(response)).resolves.toEqual({ status: "success" });
    expect(getPayUPaymentAttempt).toHaveBeenCalledWith(transactionId);
    expect(consumePayUPaymentAttempt).toHaveBeenCalledWith(transactionId, "verified_success");
  });

  it.each([
    ["failure", "failure", "verified_failure"],
    ["cancelled", "cancelled", "verified_cancelled"],
    ["canceled", "cancelled", "verified_cancelled"],
  ])("recognizes a signed %s response", async (payUStatus, expected, persistedState) => {
    getPayUPaymentAttempt.mockResolvedValueOnce(trustedAttempt(responseFields(payUStatus)));

    await expect(verifyPayUResponse(signedResponse(payUStatus))).resolves.toEqual({ status: expected });
    expect(consumePayUPaymentAttempt).toHaveBeenCalledWith(transactionId, persistedState);
  });

  it("rejects an invalid response hash", async () => {
    const response = signedResponse();
    response.hash = "0".repeat(128);

    await expect(verifyPayUResponse(response)).resolves.toEqual({ status: "invalid" });
    expect(consumePayUPaymentAttempt).not.toHaveBeenCalled();
  });

  it("rejects a tampered amount even if the attacker recomputes the response hash", async () => {
    const response = signedResponse();
    response.amount = "1.00";
    response.hash = createPayUResponseHash(response, merchantSalt);

    await expect(verifyPayUResponse(response)).resolves.toEqual({ status: "invalid" });
    expect(consumePayUPaymentAttempt).not.toHaveBeenCalled();
  });

  it("rejects a tampered transaction ID", async () => {
    const response = signedResponse();
    response.txnid = "attacker-transaction";
    response.hash = createPayUResponseHash(response, merchantSalt);
    getPayUPaymentAttempt.mockResolvedValueOnce(null);

    await expect(verifyPayUResponse(response)).resolves.toEqual({ status: "invalid" });
    expect(getPayUPaymentAttempt).toHaveBeenCalledWith("attacker-transaction");
  });

  it("rejects modified listing, buyer, or seller identifiers", async () => {
    for (const identifier of ["udf1", "udf2", "udf3"] as const) {
      const response = signedResponse();
      response[identifier] = "00000000-0000-4000-8000-000000000099";
      response.hash = createPayUResponseHash(response, merchantSalt);

      await expect(verifyPayUResponse(response)).resolves.toEqual({ status: "invalid" });
    }
    expect(consumePayUPaymentAttempt).not.toHaveBeenCalled();
  });

  it("rejects missing or nonexistent attempts", async () => {
    const response = signedResponse();
    const missing: Record<string, unknown> = { ...response };
    delete missing.udf3;
    await expect(verifyPayUResponse(missing)).resolves.toEqual({ status: "invalid" });

    getPayUPaymentAttempt.mockResolvedValueOnce(null);
    await expect(verifyPayUResponse(response)).resolves.toEqual({ status: "invalid" });
    expect(consumePayUPaymentAttempt).not.toHaveBeenCalled();
  });

  it("rejects duplicate/replayed valid responses atomically", async () => {
    consumePayUPaymentAttempt.mockResolvedValueOnce("duplicate");

    await expect(verifyPayUResponse(signedResponse())).resolves.toEqual({ status: "duplicate" });
    expect(consumePayUPaymentAttempt).toHaveBeenCalledOnce();
  });

  it("rejects the response if the current database listing price no longer matches", async () => {
    getPayUPaymentAttempt.mockResolvedValueOnce({
      ...trustedAttempt(),
      current_selling_price: "130.00",
    });

    await expect(verifyPayUResponse(signedResponse())).resolves.toEqual({ status: "invalid" });
    expect(consumePayUPaymentAttempt).not.toHaveBeenCalled();
  });

  it("fails safely when PayU credentials are unavailable", async () => {
    vi.stubEnv("PAYU_MERCHANT_SALT", "");

    await expect(verifyPayUResponse(signedResponse())).resolves.toEqual({ status: "invalid" });
    expect(consumePayUPaymentAttempt).not.toHaveBeenCalled();
  });

  it("does not access orders, payments, or listing mutation APIs and never exposes the salt", async () => {
    const result = await verifyPayUResponse(signedResponse());
    const source = readFileSync(join(process.cwd(), "src/services/payu-verification.ts"), "utf8");
    const clientButton = readFileSync(
      join(process.cwd(), "src/components/listings/buy-now-button.tsx"),
      "utf8",
    );

    expect(result).toEqual({ status: "success" });
    expect(JSON.stringify(result)).not.toContain(merchantSalt);
    expect(source).not.toMatch(/from\(["']orders["']\)|from\(["']payments["']\)|status\s*=\s*["']SOLD/i);
    expect(source).not.toContain(merchantSalt);
    expect(clientButton).not.toMatch(/PAYU_MERCHANT_SALT|merchantSalt|salt/i);
  });

  it("does not log response hashes or sensitive payment values", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sensitiveMessage = `${merchantSalt}:${signedResponse().hash}`;
    getPayUPaymentAttempt.mockRejectedValueOnce(new Error(sensitiveMessage));

    await expect(verifyPayUResponse(signedResponse())).resolves.toEqual({ status: "invalid" });
    expect(errorSpy).toHaveBeenCalledWith("PayU response verification failed.");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(merchantSalt);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(signedResponse().hash);
  });
});
