import { z } from "zod";

export const MAX_LISTING_IMAGES = 8;
export const MAX_LISTING_IMAGE_BYTES = 5 * 1024 * 1024;
const imageTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type ListingImageMime = keyof typeof imageTypes;

export const listingImageUploadSchema = z.object({
  type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  extension: z.enum(["jpg", "jpeg", "png", "webp"]),
  size: z.number().int().positive().max(MAX_LISTING_IMAGE_BYTES),
}).refine((value) => {
  const expected = imageTypes[value.type];
  return value.extension === expected || (value.type === "image/jpeg" && value.extension === "jpeg");
}, { path: ["extension"], message: "The file extension does not match its image type." });

export const imageSortOrderSchema = z.number().int().min(0).max(MAX_LISTING_IMAGES - 1);

export function detectImageMime(bytes: Uint8Array): ListingImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
