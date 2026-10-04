import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const policy = readFileSync("supabase/migrations/20261004000005_seller_listing_image_reads.sql", "utf8");

describe("listing image Storage read policy", () => {
  it("allows authenticated owners to read only objects registered to their own listing", () => {
    expect(policy).toMatch(/l\.seller_id\s*=\s*auth\.uid\(\)/i);
    expect(policy).toMatch(/i\.listing_id\s*=\s*l\.id\s+AND\s+i\.storage_path\s*=\s*storage\.objects\.name/i);
  });

  it("allows unauthenticated reads only while the matching listing is active", () => {
    expect(policy).toMatch(/\(l\.status\s*=\s*'ACTIVE'\s+OR\s+l\.seller_id\s*=\s*auth\.uid\(\)\)/i);
    expect(policy).toMatch(/l\.id::text\s*=\s*\(storage\.foldername\(name\)\)\[2\]/i);
    expect(policy).toMatch(/l\.seller_id::text\s*=\s*\(storage\.foldername\(name\)\)\[1\]/i);
  });
});
