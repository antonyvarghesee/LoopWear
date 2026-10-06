import "server-only";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth";
import { isCurrentUserSuspended } from "@/services/moderation-enforcement";

const listingIdSchema = z.string().uuid();

export type PurchaseValidation = {
  buyerId: string;
  listingId: string;
  sellerId: string;
  title: string;
  sellingPrice: string;
};

export type PurchaseValidationResult =
  | { success: true; data: PurchaseValidation }
  | { success: false; error: string };

export async function validatePurchase(listingId: unknown): Promise<PurchaseValidationResult> {
  const parsedId = listingIdSchema.safeParse(listingId);
  if (!parsedId.success) {
    return { success: false, error: "This listing could not be found." };
  }

  const buyer = await getCurrentUser();
  if (!buyer) {
    return { success: false, error: "Sign in to purchase this listing." };
  }
  if (await isCurrentUserSuspended()) {
    return { success: false, error: "Your account cannot start a purchase right now." };
  }
  if (!isSupabaseConfigured()) {
    throw new Error("Purchase validation is temporarily unavailable.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: listing, error } = await supabase
    .from("listings")
    .select("id, seller_id, title, selling_price::text, status")
    .eq("id", parsedId.data)
    .maybeSingle();

  if (error) {
    console.error("Purchase listing lookup failed:", error);
    throw new Error("Purchase validation is temporarily unavailable.");
  }
  if (!listing || listing.status !== "ACTIVE") {
    return { success: false, error: "This listing is not available for purchase." };
  }
  if (listing.seller_id === buyer.id) {
    return { success: false, error: "You cannot purchase your own listing." };
  }

  const sellingPrice = listing.selling_price;
  if (
    typeof sellingPrice !== "string"
    || !/^\d+(?:\.\d{1,2})?$/.test(sellingPrice)
    || !Number.isFinite(Number(sellingPrice))
    || Number(sellingPrice) <= 0
  ) {
    console.error("Active listing has an invalid selling price:", parsedId.data);
    throw new Error("Purchase validation is temporarily unavailable.");
  }

  return {
    success: true,
    data: {
      buyerId: buyer.id,
      listingId: listing.id,
      sellerId: listing.seller_id,
      title: listing.title,
      sellingPrice,
    },
  };
}
