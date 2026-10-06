import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261013000000_buyer_order_delivery_confirmation.sql"),
  "utf8",
);
const schema = readFileSync(
  join(process.cwd(), "supabase/migrations/20261004000000_initial_schema.sql"),
  "utf8",
);
const purchaseSecurity = readFileSync(
  join(process.cwd(), "supabase/migrations/20261005000000_purchase_security.sql"),
  "utf8",
);

describe("buyer delivery confirmation migration contract", () => {
  it("adds delivery metadata columns only when absent", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS delivered_by UUID REFERENCES public\.profiles\(id\)/i);
  });

  it("permits only one atomic shipped-to-delivered update by the authenticated buyer", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.confirm_order_delivery\(p_order_id UUID\)/i);
    expect(migration).toMatch(/IF auth\.uid\(\) IS NULL[\s\S]*?authentication required/i);
    expect(migration).toMatch(/UPDATE public\.orders[\s\S]*?SET status = 'delivered'[\s\S]*?delivered_at = confirmation_time[\s\S]*?delivered_by = auth\.uid\(\)/i);
    expect(migration).toMatch(/WHERE id = p_order_id[\s\S]*?AND buyer_id = auth\.uid\(\)[\s\S]*?AND status = 'shipped'/i);
    expect(migration).toMatch(/RETURNING id INTO updated_order_id[\s\S]*?IF NOT FOUND THEN[\s\S]*?USING ERRCODE = '22023'/i);
    expect(migration).not.toMatch(/UPDATE public\.orders[\s\S]*?SET status = p_/i);
  });

  it("keeps concurrent confirmations safe through the conditional row update", () => {
    const update = /UPDATE public\.orders([\s\S]*?)RETURNING id INTO updated_order_id/i.exec(migration);
    expect(update?.[1]).toMatch(/AND status = 'shipped'/i);
    expect(update?.[1]).toMatch(/AND buyer_id = auth\.uid\(\)/i);
    expect(migration).toMatch(/IF NOT FOUND THEN[\s\S]*?order is not available for delivery confirmation/i);
  });

  it.each(["paid", "delivered", "cancelled", "refunded"])("%s cannot transition directly to delivered", (status) => {
    const guardedSourceStatus = /AND status = '([^']+)'/i.exec(migration)?.[1];
    expect(guardedSourceStatus).toBe("shipped");
    expect(guardedSourceStatus).not.toBe(status);
  });

  it("does not grant browser roles direct order writes and limits RPC execution to authenticated users", () => {
    expect(purchaseSecurity).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.orders, public\.payments\s+FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.confirm_order_delivery\(UUID\)[\s\S]*?FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.confirm_order_delivery\(UUID\)[\s\S]*?TO authenticated/i);
    expect(migration).not.toMatch(/GRANT .*confirm_order_delivery.*TO anon/i);
  });

  it("uses delivered as the existing authoritative successful delivery status", () => {
    expect(schema).toMatch(/status TEXT DEFAULT 'pending' NOT NULL CHECK \(status IN \('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'\)\)/i);
    expect(migration).toMatch(/SET status = 'delivered'/i);
    expect(migration).toMatch(/AND status = 'shipped'/i);
  });
});
