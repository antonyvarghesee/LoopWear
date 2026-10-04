import { describe, expect, it } from "vitest";
import { detectImageMime, listingImageUploadSchema, MAX_LISTING_IMAGE_BYTES, MAX_LISTING_IMAGES } from "@/lib/validations/listing-image";

describe("listing image validation", () => {
  it.each([
    ["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"],
  ])("accepts %s", (type, extension) => {
    expect(listingImageUploadSchema.safeParse({ type, extension, size: 100 }).success).toBe(true);
  });
  it.each([["image/svg+xml", "svg"], ["image/jpeg", "png"], ["image/png", "jpg"]])("rejects unsafe or mismatched type %s/%s", (type, extension) => {
    expect(listingImageUploadSchema.safeParse({ type, extension, size: 100 }).success).toBe(false);
  });
  it("rejects empty and oversized files and exposes the 8 image limit", () => {
    expect(listingImageUploadSchema.safeParse({ type: "image/jpeg", extension: "jpg", size: 0 }).success).toBe(false);
    expect(listingImageUploadSchema.safeParse({ type: "image/jpeg", extension: "jpg", size: MAX_LISTING_IMAGE_BYTES + 1 }).success).toBe(false);
    expect(MAX_LISTING_IMAGES).toBe(8);
  });
  it("checks image signatures", () => {
    expect(detectImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0]))).toBe("image/jpeg");
    expect(detectImageMime(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe("image/png");
    expect(detectImageMime(new TextEncoder().encode("RIFFxxxxWEBP"))).toBe("image/webp");
    expect(detectImageMime(new TextEncoder().encode("<svg"))).toBeNull();
  });
});
