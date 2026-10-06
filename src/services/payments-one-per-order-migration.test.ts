import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261010000000_payments_one_per_order.sql"),
  "utf8",
);
const historicalIndexMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261006000000_stripe_webhook_purchase_confirmation.sql"),
  "utf8",
);

describe("one payment per order migration", () => {
  it("preflights duplicate order IDs and aborts without changing payment rows", () => {
    expect(migration).toMatch(/FROM public\.payments AS payments[\s\S]*?GROUP BY payments\.order_id[\s\S]*?HAVING COUNT\(\*\) > 1/i);
    expect(migration).toMatch(/RAISE EXCEPTION 'Cannot enforce one payment per order: duplicate payment order_ids exist'/i);
    expect(migration).not.toMatch(/(?:INSERT|UPDATE|DELETE)\s+INTO?\s+public\.payments/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.payments/i);
  });

  it("ensures the provider-neutral unique index on payments.order_id", () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS payments_one_per_order_idx\s+ON public\.payments \(order_id\)/i);
  });

  it("confirms the same index was introduced historically and is retained by provider-neutral migration", () => {
    expect(historicalIndexMigration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS payments_one_per_order_idx\s+ON public\.payments \(order_id\)/i);

    const providerNeutralMigration = readFileSync(
      join(process.cwd(), "supabase/migrations/20261007000000_provider_neutral_payments.sql"),
      "utf8",
    );
    expect(providerNeutralMigration).not.toMatch(/DROP INDEX IF EXISTS public\.payments_one_per_order_idx/i);
  });
});
