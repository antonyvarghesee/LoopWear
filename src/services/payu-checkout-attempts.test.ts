import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261008000000_provider_checkout_attempts.sql"),
  "utf8",
);

describe("provider checkout attempt migration", () => {
  it("stores pending provider-neutral checkout correlation without creating payments or orders", () => {
    expect(migration).toMatch(/CREATE TABLE public\.provider_checkout_attempts/i);
    expect(migration).toMatch(/PRIMARY KEY \(payment_provider, provider_transaction_id\)/i);
    expect(migration).toMatch(/response_state TEXT NOT NULL DEFAULT 'pending'/i);
    expect(migration).toMatch(/expires_at TIMESTAMPTZ NOT NULL DEFAULT \(NOW\(\) \+ INTERVAL '24 hours'\)/i);
    expect(migration).not.toMatch(/INSERT INTO public\.(?:orders|payments)/i);
    expect(migration).not.toMatch(/SET status = 'SOLD'/i);
  });

  it("checks the database listing owner, active state, and price before registering an attempt", () => {
    expect(migration).toMatch(/FROM public\.listings AS listings[\s\S]*?FOR UPDATE/i);
    expect(migration).toMatch(/listing_row\.status <> 'ACTIVE'/i);
    expect(migration).toMatch(/listing_row\.seller_id <> p_seller_id/i);
    expect(migration).toMatch(/p_buyer_id = listing_row\.seller_id/i);
    expect(migration).toMatch(/listing_row\.selling_price <> p_amount/i);
  });

  it("restricts attempt reads and replay-safe consumption to service_role", () => {
    expect(migration).toMatch(/auth\.role\(\) IS DISTINCT FROM 'service_role'/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_provider_checkout_attempt[\s\S]*?FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_provider_checkout_attempt[\s\S]*?TO service_role/i);
    expect(migration).toMatch(/response_state = 'pending'[\s\S]*?RETURNING provider_transaction_id/i);
    expect(migration).toMatch(/RETURN 'duplicate'/i);
  });

  it("does not create orders/payments or change listing status when consuming a response", () => {
    const consumeFunction = migration.split(
      "CREATE OR REPLACE FUNCTION public.consume_provider_checkout_attempt",
    )[1];

    expect(consumeFunction).toBeDefined();
    expect(consumeFunction).not.toMatch(/INSERT INTO public\.(?:orders|payments)/i);
    expect(consumeFunction).not.toMatch(/UPDATE public\.listings/i);
    expect(consumeFunction).toMatch(/UPDATE public\.provider_checkout_attempts/i);
  });
});
