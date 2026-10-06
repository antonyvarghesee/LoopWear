import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261014000000_exclude_sellers_from_delivery_confirmation.sql"),
  "utf8",
);

describe("delivery confirmation seller exclusion migration", () => {
  it("requires the caller to be the buyer and not the seller of a shipped order", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.confirm_order_delivery\(p_order_id UUID\)/i);
    expect(migration).toMatch(/SET search_path = pg_catalog, public/i);
    expect(migration).toMatch(/WHERE id = p_order_id[\s\S]*?AND buyer_id = auth\.uid\(\)[\s\S]*?AND seller_id <> auth\.uid\(\)[\s\S]*?AND status = 'shipped'/i);
    expect(migration).toMatch(/delivered_by = auth\.uid\(\)/i);
  });
});
