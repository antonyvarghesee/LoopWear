import { z } from "zod";

export const listingGenders = ["Women", "Men", "Unisex", "Kids"] as const;
export const listingConditions = [
  "New with Tags",
  "Like New",
  "Excellent Pre-Owned",
  "Very Good",
  "Good",
] as const;
export type ListingGender = (typeof listingGenders)[number];
export type ListingCondition = (typeof listingConditions)[number];

const forbiddenControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const text = (min: number, max: number, label: string) => z.string()
  .trim()
  .min(min, `${label} must be at least ${min} characters`)
  .max(max, `${label} cannot exceed ${max} characters`)
  .refine((value) => !forbiddenControls.test(value), `${label} contains unsupported characters`);

const optionalText = (max: number, label: string) => z.union([
  z.string().trim().max(max, `${label} cannot exceed ${max} characters`).refine(
    (value) => !forbiddenControls.test(value),
    `${label} contains unsupported characters`,
  ),
  z.literal(""),
]).optional().transform((value) => value || undefined);

const money = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return Number.NaN;
    return Number(trimmed);
  }
  return value;
}, z.number().finite().positive("Price must be greater than zero").max(99_999_999.99, "Price is too high").refine(
  (value) => Math.round(value * 100) / 100 === value,
  "Price can have at most two decimal places",
));

const optionalMoney = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return Number.NaN;
    return Number(trimmed);
  }
  return value;
}, z.number().finite().positive("Original price must be greater than zero").max(99_999_999.99, "Original price is too high").refine(
  (value) => Math.round(value * 100) / 100 === value,
  "Original price can have at most two decimal places",
).optional());

const listingFieldsSchema = z.object({
  title: text(5, 120, "Title"),
  description: text(20, 5000, "Description"),
  categoryId: z.string().uuid("Choose a category"),
  brandId: z.union([z.string().uuid("Choose a valid brand"), z.literal("")]).transform((value) => value || null),
  gender: z.enum(listingGenders, { error: "Choose a gender category" }),
  size: text(1, 32, "Size"),
  condition: z.enum(listingConditions, { error: "Choose an item condition" }),
  color: optionalText(60, "Color"),
  material: optionalText(100, "Material"),
  originalPrice: optionalMoney,
  sellingPrice: money,
  location: optionalText(120, "Location"),
});

export const createListingSchema = listingFieldsSchema.strict().superRefine((data, context) => {
  if (data.originalPrice !== undefined && data.originalPrice < data.sellingPrice) {
    context.addIssue({ code: "custom", path: ["originalPrice"], message: "Original price must be at least the selling price" });
  }
});

export const updateListingSchema = createListingSchema;
export type CreateListingInput = z.output<typeof createListingSchema>;
export type UpdateListingInput = z.output<typeof updateListingSchema>;
