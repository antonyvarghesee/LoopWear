import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { createSupabaseServerClient, getCurrentUser } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/auth", () => ({ getCurrentUser }));

import { validatePurchase } from "@/services/purchases";

const buyerId = "00000000-0000-4000-8000-000000000001";
const sellerId = "00000000-0000-4000-8000-000000000002";
const listingId = "00000000-0000-4000-8000-000000000003";

function setup(options: {
  userId?: string | null;
  listing?: {
    id: string;
    seller_id: string;
    title: string;
    selling_price: number | string;
    status: string;
  } | null;
} = {}) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({
    data: Object.hasOwn(options, "listing")
      ? options.listing
      : { id: listingId, seller_id: sellerId, title: "Wool coat", selling_price: 129.95, status: "ACTIVE" },
    error: null,
  });
  createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });
  getCurrentUser.mockResolvedValue(options.userId === null ? null : { id: options.userId ?? buyerId });
  return query;
}

describe("purchase validation service", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getCurrentUser.mockReset();
  });

  it("rejects an unauthenticated buyer before querying Supabase", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await validatePurchase(listingId)).toEqual({
      success: false,
      error: "Sign in to purchase this listing.",
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("rejects checkout input that contains anything other than a listing ID", async () => {
    setup();
    expect(await validatePurchase({ listingId, price: 0.01 })).toEqual({
      success: false,
      error: "This listing could not be found.",
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("rejects a seller purchasing their own listing", async () => {
    setup({ userId: sellerId });
    expect(await validatePurchase(listingId)).toEqual({
      success: false,
      error: "You cannot purchase your own listing.",
    });
  });

  it.each(["DRAFT", "ARCHIVED", "REMOVED"])("rejects inactive listing status %s", async (status) => {
    setup({ listing: { id: listingId, seller_id: sellerId, title: "Wool coat", selling_price: 129.95, status } });
    expect(await validatePurchase(listingId)).toMatchObject({ success: false });
  });

  it("rejects a sold listing", async () => {
    setup({ listing: { id: listingId, seller_id: sellerId, title: "Wool coat", selling_price: 129.95, status: "SOLD" } });
    expect(await validatePurchase(listingId)).toMatchObject({ success: false });
  });

  it("returns the price fetched from the database with only checkout-relevant data", async () => {
    const query = setup({
      listing: { id: listingId, seller_id: sellerId, title: "Wool coat", selling_price: "129.95", status: "ACTIVE" },
    });
    expect(await validatePurchase(listingId)).toEqual({
      success: true,
      data: {
        buyerId,
        listingId,
        sellerId,
        title: "Wool coat",
        sellingPrice: "129.95",
      },
    });
    expect(query.select).toHaveBeenCalledWith("id, seller_id, title, selling_price::text, status");
    expect(query.eq).toHaveBeenCalledWith("id", listingId);
    expect(query.eq).not.toHaveBeenCalledWith("selling_price", expect.anything());
  });
});

describe("purchase database security migration", () => {
  const migrationPath = join(process.cwd(), "supabase/migrations/20261005000000_purchase_security.sql");

  it("restricts order reads to authenticated buyers and sellers of the ordered listing", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toMatch(/CREATE POLICY "Orders readable by buyer or listing seller"\s+ON public\.orders FOR SELECT TO authenticated/i);
    expect(migration).toMatch(/buyer_id = \(SELECT auth\.uid\(\)\)[\s\S]*?listing\.id = orders\.listing_id[\s\S]*?listing\.seller_id = \(SELECT auth\.uid\(\)\)/i);
    expect(migration).toMatch(/CREATE POLICY "Order payments readable by participants"\s+ON public\.payments FOR SELECT TO authenticated/i);
  });

  it("grants clients read access only and reserves writes for the trusted server role", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.orders, public\.payments\s+FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT SELECT ON TABLE public\.orders, public\.payments TO authenticated/i);
    expect(migration).toMatch(/GRANT ALL PRIVILEGES ON TABLE public\.orders, public\.payments TO service_role/i);
    expect(migration).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL)[^;]*TO (?:PUBLIC|anon|authenticated)/i);

    const listingMigration = readFileSync(
      join(process.cwd(), "supabase/migrations/20261004000003_listing_system.sql"),
      "utf8",
    );
    expect(listingMigration).toMatch(/NEW\.status = 'SOLD' AND auth\.uid\(\) IS NULL/);
  });

  it("prevents duplicate unresolved listing orders and duplicate order payments while allowing cancelled/refunded retries", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS orders_one_unresolved_per_listing_idx[\s\S]*?ON public\.orders \(listing_id\)[\s\S]*?WHERE status NOT IN \('cancelled', 'refunded'\)/i);
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_payment_intent_id_idx[\s\S]*?ON public\.orders \(stripe_payment_intent_id\)[\s\S]*?WHERE stripe_payment_intent_id IS NOT NULL/i);
    expect(migration).not.toMatch(/UNIQUE INDEX[^;]*payments\s*\(\s*order_id\s*\)/i);

    const initialSchema = readFileSync(
      join(process.cwd(), "supabase/migrations/20261004000000_initial_schema.sql"),
      "utf8",
    );
    expect(initialSchema).toMatch(/stripe_payment_intent_id TEXT NOT NULL UNIQUE/);
  });
});
