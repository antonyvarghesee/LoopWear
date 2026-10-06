import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20261011000000_reviews_foundation.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const initialSchema = readFileSync(
  join(process.cwd(), "supabase/migrations/20261004000000_initial_schema.sql"),
  "utf8",
);
const purchaseSecurity = readFileSync(
  join(process.cwd(), "supabase/migrations/20261005000000_purchase_security.sql"),
  "utf8",
);
const providerNeutralPayments = readFileSync(
  join(process.cwd(), "supabase/migrations/20261007000000_provider_neutral_payments.sql"),
  "utf8",
);

describe("Phase 11A reviews migration contract", () => {
  it("reuses the existing reviews table and enforces integer ratings from 1 through 5", () => {
    expect(initialSchema).toMatch(/CREATE TABLE IF NOT EXISTS public\.reviews/i);
    expect(initialSchema).toMatch(/rating INTEGER NOT NULL CHECK \(rating >= 1 AND rating <= 5\)/i);
    expect(migration).toMatch(/ALTER TABLE public\.reviews[\s\S]*?ADD COLUMN IF NOT EXISTS listing_id UUID/i);
    expect(migration).not.toMatch(/CREATE TABLE(?: IF NOT EXISTS)? public\.reviews/i);
    expect(migration).not.toMatch(/DROP CONSTRAINT[^;]*rating/i);
  });

  it("keeps the existing one-review-per-order uniqueness and ties reviews to the order listing", () => {
    expect(initialSchema).toMatch(/order_id UUID NOT NULL REFERENCES public\.orders\(id\) ON DELETE CASCADE UNIQUE/i);
    expect(migration).toMatch(/SET reviewer_id = order_row\.buyer_id,[\s\S]*?reviewee_id = order_row\.seller_id,[\s\S]*?listing_id = order_row\.listing_id/i);
    expect(migration).toMatch(/ALTER COLUMN listing_id SET NOT NULL/i);
    expect(migration).toMatch(/FOREIGN KEY \(listing_id\) REFERENCES public\.listings\(id\) ON DELETE CASCADE/i);
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS reviews_listing_created_at_idx[\s\S]*?ON public\.reviews \(listing_id, created_at DESC\)/i);
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS reviews_reviewee_created_at_idx[\s\S]*?ON public\.reviews \(reviewee_id, created_at DESC\)/i);
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS reviews_reviewer_created_at_idx[\s\S]*?ON public\.reviews \(reviewer_id, created_at DESC\)/i);
  });

  it("validates the authenticated buyer, paid order, successful payment, seller and listing in a trigger", () => {
    expect(migration).toMatch(/auth\.uid\(\) IS NULL[\s\S]*?authentication required/i);
    expect(migration).toMatch(/JOIN public\.listings AS listing[\s\S]*?listing\.id = purchase\.listing_id[\s\S]*?listing\.seller_id = purchase\.seller_id/i);
    expect(migration).toMatch(/JOIN public\.payments AS payment[\s\S]*?payment\.order_id = purchase\.id[\s\S]*?payment\.status = 'succeeded'[\s\S]*?payment\.amount = purchase\.amount/i);
    expect(migration).toMatch(/purchase\.status IN \('paid', 'shipped', 'delivered'\)/i);
    expect(migration).toMatch(/purchase\.buyer_id = auth\.uid\(\)/i);
    expect(migration).toMatch(/purchase\.buyer_id <> purchase\.seller_id/i);
    expect(migration).toMatch(/NEW\.reviewer_id := order_row\.buyer_id[\s\S]*?NEW\.reviewee_id := order_row\.seller_id[\s\S]*?NEW\.listing_id := order_row\.listing_id/i);
    expect(migration).toMatch(/FOR SHARE OF purchase, listing, payment/i);
  });

  it("limits table access to authenticated users' own reviews and prevents browser-supplied identity fields", () => {
    expect(migration).toMatch(/CREATE POLICY "Buyers can read own reviews"[\s\S]*?USING \(reviewer_id = \(SELECT auth\.uid\(\)\)\)/i);
    expect(migration).toMatch(/CREATE POLICY "Buyers can create reviews for completed purchases"[\s\S]*?WITH CHECK \(reviewer_id = \(SELECT auth\.uid\(\)\)\)/i);
    expect(migration).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.reviews FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT SELECT ON TABLE public\.reviews TO authenticated/i);
    expect(migration).toMatch(/GRANT INSERT \(order_id, rating, comment\) ON TABLE public\.reviews TO authenticated/i);
    expect(migration).not.toMatch(/GRANT INSERT[^;]*(reviewer_id|reviewee_id|listing_id)/i);
    expect(migration).not.toMatch(/CREATE POLICY .*reviews.*FOR UPDATE|CREATE POLICY .*reviews.*FOR DELETE/i);
  });

  it("serves public reviews only through a narrow paginated projection", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_public_seller_reviews/i);
    expect(migration).toMatch(/RETURNS TABLE \(\s*listing_id UUID,\s*rating INTEGER,\s*comment TEXT,\s*created_at TIMESTAMPTZ/i);
    expect(migration).toMatch(/seller\.username = p_username/i);
    expect(migration).toMatch(/p_listing_id IS NULL OR review\.listing_id = p_listing_id/i);
    expect(migration).toMatch(/p_limit BETWEEN 1 AND 50/i);
    expect(migration).toMatch(/p_offset BETWEEN 0 AND 10000/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_public_seller_reviews[\s\S]*?FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_public_seller_reviews[\s\S]*?TO anon, authenticated/i);
    expect(migration).not.toMatch(/CREATE POLICY "Reviews are viewable by everyone"/i);
  });

  it("preserves the existing buyer/seller orders and payments write restrictions", () => {
    expect(purchaseSecurity).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.orders, public\.payments\s+FROM PUBLIC, anon, authenticated/i);
    expect(providerNeutralPayments).toMatch(/CREATE TABLE public\.payment_webhook_events/i);
    expect(migration).not.toMatch(/ALTER TABLE public\.(orders|payments)/i);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.confirm_provider_purchase/i);
  });
});
