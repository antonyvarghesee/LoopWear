import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261007000000_provider_neutral_payments.sql"),
  "utf8",
);

describe("provider-neutral payment migration", () => {
  it("migrates provider identifiers and removes provider-specific columns and functions", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS payment_provider TEXT/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS provider_payment_id TEXT/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS provider_checkout_id TEXT/i);
    expect(migration).toMatch(/DROP COLUMN IF EXISTS stripe_payment_intent_id/i);
    expect(migration).toMatch(/DROP COLUMN IF EXISTS stripe_checkout_session_id/i);
    expect(migration).toMatch(/DROP FUNCTION IF EXISTS public\.confirm_stripe_checkout_purchase/i);
    expect(migration).toMatch(/DROP TABLE IF EXISTS public\.stripe_webhook_events/i);
  });

  it("preserves legacy payment rows with NULL Stripe IDs without inventing provider IDs", () => {
    expect(migration).toMatch(/UPDATE public\.payments[\s\S]*?provider_payment_id = stripe_payment_intent_id[\s\S]*?WHERE stripe_payment_intent_id IS NOT NULL/i);
    expect(migration).not.toMatch(/ALTER COLUMN (?:payment_provider|provider_payment_id) SET NOT NULL/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.payments/i);
    expect(migration).toMatch(/ALTER TABLE public\.payments[\s\S]*?DROP COLUMN IF EXISTS stripe_payment_intent_id/i);
  });

  it("uses provider-scoped unique identifiers and event idempotency", () => {
    expect(migration).toMatch(/orders_provider_payment_id_idx[\s\S]*?ON public\.orders \(payment_provider, provider_payment_id\)/i);
    expect(migration).toMatch(/orders_provider_checkout_id_idx[\s\S]*?ON public\.orders \(payment_provider, provider_checkout_id\)/i);
    expect(migration).toMatch(/payments_provider_payment_id_idx[\s\S]*?ON public\.payments \(payment_provider, provider_payment_id\)/i);
    expect(migration).toMatch(/PRIMARY KEY \(payment_provider, event_id\)/i);
  });

  it("confirms a provider-neutral purchase atomically and restricts mutation to the service role", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.confirm_provider_purchase/i);
    expect(migration).toMatch(/FROM public\.listings[\s\S]*?WHERE listings\.id = p_listing_id[\s\S]*?FOR UPDATE/i);
    expect(migration).toMatch(/listing_row\.status <> 'ACTIVE'/i);
    expect(migration).toMatch(/listing_row\.selling_price \* 100 <> p_amount_minor/i);
    expect(migration).toMatch(/SET status = 'SOLD'[\s\S]*?INSERT INTO public\.orders[\s\S]*?INSERT INTO public\.payments/i);
    expect(migration).toMatch(/auth\.role\(\) IS DISTINCT FROM 'service_role'/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.confirm_provider_purchase[\s\S]*?TO service_role/i);
  });
});
