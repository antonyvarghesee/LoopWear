import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261009000000_payu_atomic_confirmation.sql"),
  "utf8",
);
const moderationPurchaseFix = readFileSync(
  join(process.cwd(), "supabase/migrations/20261021000000_suspended_seller_purchase_protection.sql"),
  "utf8",
);
const providerNeutralPayments = readFileSync(
  join(process.cwd(), "supabase/migrations/20261007000000_provider_neutral_payments.sql"),
  "utf8",
);
const purchaseSecurity = readFileSync(
  join(process.cwd(), "supabase/migrations/20261005000000_purchase_security.sql"),
  "utf8",
);
const confirmation = migration.split(
  "CREATE OR REPLACE FUNCTION public.confirm_provider_purchase",
)[1] ?? "";
const protectedConfirmation = moderationPurchaseFix.split(
  "CREATE OR REPLACE FUNCTION public.confirm_provider_purchase",
)[1] ?? "";

describe("PayU atomic confirmation migration", () => {
  it("reuses the provider-neutral confirmation RPC and supports INR for PayU", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.confirm_provider_purchase/i);
    expect(migration).toMatch(/is_payu AND LOWER\(p_currency\) <> 'inr'/i);
    expect(migration).toMatch(/LOWER\(p_currency\) <> 'usd'/i);
    expect(migration).toMatch(/payment_provider, provider_payment_id, amount, currency, status/i);
  });

  it("locks and validates the persisted attempt, then locks and validates the authoritative listing", () => {
    expect(confirmation).toMatch(/FROM public\.provider_checkout_attempts AS attempts[\s\S]*?FOR UPDATE/i);
    expect(confirmation).toMatch(/attempt_row\.expires_at <= NOW\(\)/i);
    expect(confirmation).toMatch(/attempt_row\.listing_id <> p_listing_id/i);
    expect(confirmation).toMatch(/attempt_row\.buyer_id <> p_buyer_id/i);
    expect(confirmation).toMatch(/attempt_row\.seller_id <> p_seller_id/i);
    expect(confirmation).toMatch(/attempt_row\.amount <> p_amount_minor::NUMERIC \/ 100/i);
    expect(confirmation).toMatch(/attempt_row\.currency\) <> 'inr'/i);
    expect(confirmation).toMatch(/FROM public\.listings[\s\S]*?WHERE listings\.id = p_listing_id[\s\S]*?FOR UPDATE/i);
    expect(confirmation).toMatch(/listing_row\.status <> 'ACTIVE'/i);
    expect(confirmation).toMatch(/listing_row\.seller_id <> p_seller_id/i);
    expect(confirmation).toMatch(/p_buyer_id = listing_row\.seller_id/i);
    expect(confirmation).toMatch(/listing_row\.selling_price \* 100 <> p_amount_minor/i);
  });

  it("atomically transitions the listing, inserts order/payment and consumes the attempt", () => {
    expect(confirmation).toMatch(/SET status = 'SOLD'[\s\S]*?INSERT INTO public\.orders[\s\S]*?INSERT INTO public\.payments[\s\S]*?SET response_state = 'confirmed'/i);
    expect(confirmation).toMatch(/orders\.amount = p_amount_minor::NUMERIC \/ 100/i);
    expect(confirmation).toMatch(/payments\.amount = p_amount_minor::NUMERIC \/ 100/i);
    expect(confirmation).toMatch(/LOWER\(payments\.currency\) = 'inr'/i);
    expect(confirmation).toMatch(/payments\.status = 'succeeded'/i);
    expect(confirmation).toMatch(/RAISE EXCEPTION 'PayU checkout attempt changed during confirmation'/i);
    expect(confirmation).toMatch(/p_amount_minor::NUMERIC \/ 100, LOWER\(p_currency\), 'succeeded'/i);
  });

  it("serializes duplicate and competing confirmations and returns idempotent success only for an existing paid order", () => {
    expect(confirmation).toMatch(/pg_advisory_xact_lock/i);
    expect(confirmation).toMatch(/attempt_row\.response_state = 'confirmed'[\s\S]*?RETURN 'duplicate_confirmed'/i);
    expect(providerNeutralPayments).toMatch(/PRIMARY KEY \(payment_provider, event_id\)/i);
    expect(confirmation).toMatch(/ON CONFLICT \(payment_provider, event_id\) DO NOTHING/i);
    expect(purchaseSecurity).toMatch(/orders_one_unresolved_per_listing_idx/i);
    expect(providerNeutralPayments).toMatch(/orders_provider_payment_id_idx[\s\S]*?ON public\.orders \(payment_provider, provider_payment_id\)/i);
    expect(providerNeutralPayments).toMatch(/orders_provider_checkout_id_idx[\s\S]*?ON public\.orders \(payment_provider, provider_checkout_id\)/i);
    expect(providerNeutralPayments).toMatch(/payments_provider_payment_id_idx[\s\S]*?ON public\.payments \(payment_provider, provider_payment_id\)/i);
    expect(confirmation).toMatch(/RETURN 'rejected_listing_not_active'/i);
  });

  it("keeps confirmation service-role-only and relies on transaction exceptions for full rollback", () => {
    expect(confirmation).toMatch(/auth\.role\(\) IS DISTINCT FROM 'service_role'/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.confirm_provider_purchase[\s\S]*?FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.confirm_provider_purchase[\s\S]*?TO service_role/i);
    expect(confirmation).not.toMatch(/EXCEPTION\s+WHEN/i);
    expect(confirmation).toMatch(/INSERT INTO public\.orders[\s\S]*?INSERT INTO public\.payments/i);
    expect(confirmation).toMatch(/INSERT INTO public\.payments[\s\S]*?UPDATE public\.provider_checkout_attempts[\s\S]*?RAISE EXCEPTION/i);
    expect(migration).not.toMatch(/(^|\n)\s*COMMIT\s*;/i);
  });

  it("checks the listing before writes and consumes the attempt only after order and payment inserts", () => {
    expect(confirmation.indexOf("SELECT listings.id")).toBeLessThan(
      confirmation.indexOf("SET status = 'SOLD'"),
    );
    expect(confirmation.indexOf("INSERT INTO public.orders")).toBeLessThan(
      confirmation.indexOf("INSERT INTO public.payments"),
    );
    expect(confirmation.indexOf("INSERT INTO public.payments")).toBeLessThan(
      confirmation.lastIndexOf("SET response_state = 'confirmed'"),
    );
    expect(confirmation).toMatch(/UPDATE public\.payment_webhook_events SET outcome = 'processed'[\s\S]*?RETURN 'processed'/i);
  });

  it("rechecks listing moderation and seller suspension in the locked confirmation transaction", () => {
    expect(protectedConfirmation).toMatch(/FROM public\.listings[\s\S]*?FOR UPDATE/i);
    expect(protectedConfirmation).toMatch(/FROM public\.profiles WHERE id = listing_row\.seller_id FOR SHARE/i);
    expect(protectedConfirmation).toMatch(/listing_row\.status <> 'ACTIVE'[\s\S]*?NOT public\.is_listing_publicly_available\(p_listing_id\)/i);
    expect(protectedConfirmation).toMatch(/listing_state\.moderation_state = 'hidden'/i);
    expect(protectedConfirmation).toMatch(/seller_state\.moderation_state = 'suspended'/i);
    expect(protectedConfirmation).toMatch(/attempt_row\.response_state NOT IN \('pending', 'verified_success'\)/i);
    expect(protectedConfirmation).toMatch(/attempt_row\.expires_at <= NOW\(\)/i);
    expect(moderationPurchaseFix).toMatch(/REVOKE ALL ON FUNCTION public\.confirm_provider_purchase[\s\S]*?FROM PUBLIC, anon, authenticated, service_role[\s\S]*?GRANT EXECUTE ON FUNCTION public\.confirm_provider_purchase[\s\S]*?TO service_role/i);
  });

  it("records a verified success needing manual refund review without selling the listing or creating an order", () => {
    const ineligiblePath = protectedConfirmation.split(
      "IF NOT FOUND OR listing_row.status <> 'ACTIVE'",
    )[1]?.split("IF listing_row.selling_price * 100 <> p_amount_minor")[0] ?? "";

    expect(moderationPurchaseFix).toMatch(/outcome IN \('processing', 'processed', 'duplicate', 'rejected', 'refund_required'\)/i);
    expect(moderationPurchaseFix).toMatch(/'confirmed', 'refund_required'/i);
    expect(ineligiblePath).toMatch(/SET outcome = 'refund_required'/i);
    expect(ineligiblePath).toMatch(/SET response_state = 'refund_required'/i);
    expect(ineligiblePath).toMatch(/RETURN 'refund_required'/i);
    expect(ineligiblePath).not.toMatch(/SET status = 'SOLD'|INSERT INTO public\.(?:orders|payments)/i);
    expect(protectedConfirmation).toMatch(/attempt_row\.response_state = 'refund_required'[\s\S]*?RETURN 'refund_required'/i);
    expect(protectedConfirmation).toMatch(/SET status = 'SOLD'[\s\S]*?INSERT INTO public\.orders[\s\S]*?INSERT INTO public\.payments[\s\S]*?SET response_state = 'confirmed'/i);
    expect(protectedConfirmation).toMatch(/attempt_row\.response_state = 'confirmed'[\s\S]*?RETURN 'duplicate_confirmed'/i);
    expect(protectedConfirmation).toMatch(/listing_row\.selling_price \* 100 <> p_amount_minor/i);
    expect(protectedConfirmation).toMatch(/IF listing_row\.selling_price \* 100 <> p_amount_minor THEN[\s\S]*?SET outcome = 'refund_required'[\s\S]*?SET response_state = 'refund_required'[\s\S]*?RETURN 'refund_required'/i);
  });

  it("retains expired successful attempts for verification but never confirms an expired purchase", () => {
    const attemptLookup = moderationPurchaseFix.split(
      "CREATE OR REPLACE FUNCTION public.get_provider_checkout_attempt",
    )[1]?.split("ALTER FUNCTION public.get_provider_checkout_attempt")[0] ?? "";

    expect(attemptLookup).toMatch(/attempts\.response_state IN \([\s\S]*?'pending', 'verified_success'[\s\S]*?'refund_required'/i);
    expect(protectedConfirmation).toMatch(/IF is_payu THEN[\s\S]*?attempt_row\.expires_at <= NOW\(\)[\s\S]*?SET outcome = 'refund_required'[\s\S]*?SET response_state = 'refund_required'[\s\S]*?RETURN 'refund_required'/i);
  });

  it("retains eligible-payment, amount verification, and idempotency protections in the replacement RPC", () => {
    expect(protectedConfirmation).toMatch(/attempt_row\.listing_id <> p_listing_id/i);
    expect(protectedConfirmation).toMatch(/attempt_row\.buyer_id <> p_buyer_id/i);
    expect(protectedConfirmation).toMatch(/attempt_row\.seller_id <> p_seller_id/i);
    expect(protectedConfirmation).toMatch(/attempt_row\.amount <> p_amount_minor::NUMERIC \/ 100/i);
    expect(protectedConfirmation).toMatch(/LOWER\(attempt_row\.currency\) <> 'inr'/i);
    expect(protectedConfirmation).toMatch(/pg_advisory_xact_lock/i);
    expect(protectedConfirmation).toMatch(/ON CONFLICT \(payment_provider, event_id\) DO NOTHING/i);
    expect(protectedConfirmation).toMatch(/RETURN 'duplicate_confirmed'/i);
    expect(protectedConfirmation).toMatch(/orders\.status = 'paid'[\s\S]*?payments\.status = 'succeeded'/i);
    expect(protectedConfirmation).toMatch(/auth\.role\(\) IS DISTINCT FROM 'service_role'/i);
    expect(protectedConfirmation).toMatch(/SET search_path = pg_catalog, public/i);
  });
});
