import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}));

import {
  confirmPayUPaymentAttempt,
  type PayUPaymentAttempt,
} from "@/services/payu-attempts";

const attempt: PayUPaymentAttempt = {
  payment_provider: "payu",
  provider_transaction_id: "0123456789abcdef01234567",
  listing_id: "00000000-0000-4000-8000-000000000003",
  buyer_id: "00000000-0000-4000-8000-000000000001",
  seller_id: "00000000-0000-4000-8000-000000000002",
  amount: "129.95",
  currency: "inr",
  productinfo: "Wool coat",
  firstname: "LoopWear",
  email: "buyer@example.test",
  response_state: "pending",
  current_selling_price: "129.95",
};

describe("PayU atomic confirmation RPC adapter", () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: "processed", error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the existing provider-neutral RPC using only persisted attempt values", async () => {
    await expect(confirmPayUPaymentAttempt(attempt)).resolves.toBe("processed");

    expect(rpc).toHaveBeenCalledWith("confirm_provider_purchase", {
      p_payment_provider: "payu",
      p_event_id: attempt.provider_transaction_id,
      p_event_type: "payu.payment.success",
      p_provider_checkout_id: attempt.provider_transaction_id,
      p_provider_payment_id: attempt.provider_transaction_id,
      p_listing_id: attempt.listing_id,
      p_buyer_id: attempt.buyer_id,
      p_seller_id: attempt.seller_id,
      p_amount_minor: 12995,
      p_currency: "inr",
    });
  });

  it("maps an already confirmed purchase to an idempotent success", async () => {
    rpc.mockResolvedValueOnce({ data: "duplicate_confirmed", error: null });
    await expect(confirmPayUPaymentAttempt(attempt)).resolves.toBe("duplicate_confirmed");
  });

  it("converts whole and fractional INR amounts exactly to paise", async () => {
    await confirmPayUPaymentAttempt({ ...attempt, amount: "0.5" });
    expect(rpc).toHaveBeenCalledWith(
      "confirm_provider_purchase",
      expect.objectContaining({ p_amount_minor: 50 }),
    );
  });

  it("does not call confirmation for invalid persisted amounts", async () => {
    await expect(confirmPayUPaymentAttempt({ ...attempt, amount: "12.999" })).resolves.toBe("rejected");
    expect(rpc).not.toHaveBeenCalled();
  });
});
