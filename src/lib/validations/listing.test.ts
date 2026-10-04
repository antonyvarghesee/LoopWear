import { describe, expect, it } from "vitest";
import { createListingSchema, updateListingSchema } from "./listing";

const validListing = {
  title: "Vintage Levi's denim jacket",
  description: "A well cared for vintage denim jacket with a relaxed fit.",
  categoryId: "00000000-0000-4000-8000-000000000001",
  brandId: "00000000-0000-4000-8000-000000000002",
  gender: "Unisex",
  size: "M",
  condition: "Very Good",
  color: "Indigo",
  material: "Cotton denim",
  originalPrice: "120.00",
  sellingPrice: "45.50",
  location: "Portland, OR",
};

describe("listing validation", () => {
  it("accepts a complete valid listing and parses prices as numbers", () => {
    const result = createListingSchema.safeParse(validListing);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sellingPrice).toBe(45.5);
      expect(result.data.originalPrice).toBe(120);
    }
  });

  it("requires a positive selling price and rejects negative or malformed prices", () => {
    for (const sellingPrice of ["0", "-1", "12.345", "not a price"]) {
      expect(createListingSchema.safeParse({ ...validListing, sellingPrice }).success).toBe(false);
    }
  });

  it("allows an omitted original price but rejects invalid or lower original prices", () => {
    expect(createListingSchema.safeParse({ ...validListing, originalPrice: "" }).success).toBe(true);
    expect(createListingSchema.safeParse({ ...validListing, originalPrice: "-10" }).success).toBe(false);
    expect(createListingSchema.safeParse({ ...validListing, originalPrice: "20" }).success).toBe(false);
  });

  it("rejects unbounded, unsafe text and client-supplied ownership fields", () => {
    expect(createListingSchema.safeParse({ ...validListing, title: "x".repeat(121) }).success).toBe(false);
    expect(createListingSchema.safeParse({ ...validListing, description: "Short" }).success).toBe(false);
    expect(createListingSchema.safeParse({ ...validListing, title: "Bad\u0001 title" }).success).toBe(false);
    expect(createListingSchema.safeParse({ ...validListing, sellerId: "another-user" }).success).toBe(false);
  });

  it("uses the same safe field contract for updates", () => {
    expect(updateListingSchema.safeParse(validListing).success).toBe(true);
  });
});
