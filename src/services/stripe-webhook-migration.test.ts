import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261006000000_stripe_webhook_purchase_confirmation.sql"),
  "utf8",
);
const purchaseSecurityMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261005000000_purchase_security.sql"),
  "utf8",
);

describe("Stripe purchase confirmation migration", () => {
  it("locks the listing and validates its status and price inside the confirmation function", () => {
    expect(migration).toMatch(/FROM public\.listings[\s\S]*?WHERE listings\.id = p_listing_id[\s\S]*?FOR UPDATE/i);
    expect(migration).toMatch(/listing_row\.status <> 'ACTIVE'/i);
    expect(migration).toMatch(/listing_row\.selling_price \* 100 <> p_amount_minor/i);
    expect(migration).toMatch(/UPDATE public\.listings[\s\S]*?SET status = 'SOLD'[\s\S]*?AND status = 'ACTIVE'/i);
  });

  it("creates the order, payment, sold transition, and event outcome in one database function", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.confirm_stripe_checkout_purchase/i);
    expect(migration).toMatch(/INSERT INTO public\.orders[\s\S]*?INSERT INTO public\.payments[\s\S]*?UPDATE public\.stripe_webhook_events SET outcome = 'processed'/i);
    expect(migration).toMatch(/LANGUAGE plpgsql\s+SECURITY DEFINER/i);
  });

  it("enforces event, Checkout Session, PaymentIntent, and per-order uniqueness", () => {
    expect(migration).toMatch(/event_id TEXT PRIMARY KEY/i);
    expect(migration).toMatch(/orders_stripe_checkout_session_id_idx[\s\S]*?ON public\.orders \(stripe_checkout_session_id\)/i);
    expect(migration).toMatch(/payments_one_per_order_idx[\s\S]*?ON public\.payments \(order_id\)/i);
    expect(purchaseSecurityMigration).toMatch(/orders_stripe_payment_intent_id_idx/);
    expect(migration).toMatch(/pg_advisory_xact_lock\(hashtextextended\(p_payment_intent_id, 0\)\)/i);
  });

  it("restricts the confirmation function to service-role callers", () => {
    expect(migration).toMatch(/auth\.role\(\) IS DISTINCT FROM 'service_role'/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.confirm_stripe_checkout_purchase[\s\S]*?FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.confirm_stripe_checkout_purchase[\s\S]*?TO service_role/i);
    expect(migration).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.stripe_webhook_events[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i);
  });
});
