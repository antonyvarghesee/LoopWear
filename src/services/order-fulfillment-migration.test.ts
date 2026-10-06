import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261022000000_seller_order_fulfillment.sql"),
  "utf8",
);
const purchaseSecurity = readFileSync(
  join(process.cwd(), "supabase/migrations/20261005000000_purchase_security.sql"),
  "utf8",
);
const deliveryMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261014000000_exclude_sellers_from_delivery_confirmation.sql"),
  "utf8",
);
const reviewEligibilityMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261012000000_reviews_delivered_eligibility.sql"),
  "utf8",
);

describe("seller order fulfillment migration contract", () => {
  it("derives the seller from auth.uid and atomically permits only paid-to-shipped for the owned listing", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.mark_order_shipped\(p_order_id UUID\)/i);
    expect(migration).toMatch(/SET search_path = pg_catalog, public/i);
    expect(migration).toMatch(/SET row_security = off/i);
    expect(migration).toMatch(/actor_id UUID := auth\.uid\(\)/i);
    expect(migration).toMatch(/order_row\.seller_id = actor_id[\s\S]*?order_row\.buyer_id <> actor_id[\s\S]*?order_row\.status = 'paid'[\s\S]*?FOR UPDATE/i);
    expect(migration).toMatch(/listing\.seller_id = actor_id[\s\S]*?FOR SHARE/i);
    expect(migration).toMatch(/SET status = 'shipped'/i);
    expect(migration).toMatch(/AND order_row\.seller_id = actor_id[\s\S]*?AND order_row\.buyer_id <> actor_id[\s\S]*?AND order_row\.status = 'paid'[\s\S]*?listing\.seller_id = actor_id/i);
    expect(migration).not.toMatch(/p_seller_id|p_user_id|p_actor_id/i);
    expect(migration).not.toMatch(/SET status = p_/i);
  });

  it("serializes shipment against seller suspension and rejects suspended sellers", () => {
    expect(migration).toMatch(/FROM public\.profiles[\s\S]*?WHERE id = actor_id[\s\S]*?FOR SHARE/i);
    expect(migration).toMatch(/FROM public\.user_moderation[\s\S]*?WHERE moderation\.user_id = actor_id/i);
    expect(migration).toMatch(/COALESCE\(seller_moderation_state, 'normal'\) <> 'normal'/i);
    expect(migration).toMatch(/FOR UPDATE/i);
  });

  it("grants only authenticated execution and adds no direct orders update grant", () => {
    expect(purchaseSecurity).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.orders, public\.payments[\s\S]*?FROM PUBLIC, anon, authenticated/i);
    expect(purchaseSecurity).toMatch(/listing\.seller_id = \(SELECT auth\.uid\(\)\)/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.mark_order_shipped\(UUID\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.mark_order_shipped\(UUID\)[\s\S]*?TO authenticated/i);
    expect(migration).not.toMatch(/GRANT\s+UPDATE[\s\S]*?ON\s+TABLE\s+public\.orders/i);
  });

  it("leaves the buyer-only shipped-to-delivered and delivered-only review rules intact", () => {
    expect(deliveryMigration).toMatch(
      /UPDATE public\.orders[\s\S]*?SET status = 'delivered'[\s\S]*?WHERE id = p_order_id[\s\S]*?AND buyer_id = auth\.uid\(\)[\s\S]*?AND seller_id <> auth\.uid\(\)[\s\S]*?AND status = 'shipped'/i,
    );
    expect(reviewEligibilityMigration).toMatch(/purchase\.status\s*=\s*'delivered'/i);
  });
});
