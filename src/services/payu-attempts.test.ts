import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, notifyPurchaseConfirmed } = vi.hoisted(() => ({ rpc: vi.fn(), notifyPurchaseConfirmed: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}));
vi.mock("@/services/notification-events", () => ({ notifyPurchaseConfirmed }));

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
    notifyPurchaseConfirmed.mockReset().mockResolvedValue(undefined);
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
    expect(notifyPurchaseConfirmed).toHaveBeenCalledWith("payu", attempt.provider_transaction_id);
  });

  it("maps an already confirmed purchase to an idempotent success", async () => {
    rpc.mockResolvedValueOnce({ data: "duplicate_confirmed", error: null });
    await expect(confirmPayUPaymentAttempt(attempt)).resolves.toBe("duplicate_confirmed");
    expect(notifyPurchaseConfirmed).toHaveBeenCalledWith("payu", attempt.provider_transaction_id);
  });

  it("surfaces an ineligible successful payment for refund reconciliation without sending a confirmation notification", async () => {
    rpc.mockResolvedValueOnce({ data: "refund_required", error: null });
    await expect(confirmPayUPaymentAttempt(attempt)).resolves.toBe("refund_required");
    expect(notifyPurchaseConfirmed).not.toHaveBeenCalled();
  });

  it("keeps a confirmed purchase successful if notification generation fails", async () => {
    notifyPurchaseConfirmed.mockRejectedValueOnce(new Error("notification insert failed"));
    await expect(confirmPayUPaymentAttempt(attempt)).resolves.toBe("processed");
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
