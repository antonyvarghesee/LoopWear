import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  publicReviewsQuerySchema,
  reviewSubmissionSchema,
  type ReviewSubmission,
} from "@/lib/validations/reviews";
import { getCurrentUser } from "@/services/auth";

export type PublicReview = {
  listing_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type ReviewablePurchase = {
  orderId: string;
  listingId: string;
  listingTitle: string;
  listingSlug: string;
};

export type ReviewSubmissionResult =
  | { success: true }
  | { success: false; error: string };

function amountInMinorUnits(value: string | number): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return null;
  const amount = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

export async function getPublicSellerReviews(input: unknown): Promise<PublicReview[]> {
  const parsed = publicReviewsQuerySchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid public reviews query.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_seller_reviews", {
    p_username: parsed.data.username,
    p_listing_id: parsed.data.listingId ?? null,
    p_limit: parsed.data.limit,
    p_offset: 0,
  });
  if (error) {
    console.error("Public seller reviews lookup failed.");
    throw new Error("Reviews are temporarily unavailable.");
  }
  return (data ?? []) as PublicReview[];
}

export async function getReviewablePurchasesForSeller(
  username: unknown,
): Promise<ReviewablePurchase[]> {
  try {
    if (typeof username !== "string" || !/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      throw new Error("Invalid seller username for review eligibility lookup.");
    }
    const user = await getCurrentUser();
    if (!user) return [];

    const admin = createSupabaseAdminClient();
    const { data: seller, error: sellerError } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (sellerError) throw sellerError;
    if (!seller || seller.id === user.id) return [];

    const { data: orders, error: ordersError } = await admin
      .from("orders")
      .select("id, listing_id, amount, status")
      .eq("buyer_id", user.id)
      .eq("seller_id", seller.id)
      .eq("status", "delivered");
    if (ordersError) throw ordersError;
    if (!orders?.length) return [];

    const orderIds = orders.map((order) => order.id);
    const listingIds = [...new Set(orders.map((order) => order.listing_id))];
    const [paymentsResult, reviewsResult, listingsResult] = await Promise.all([
      admin.from("payments")
        .select("order_id, amount")
        .in("order_id", orderIds)
        .eq("status", "succeeded"),
      admin.from("reviews")
        .select("order_id")
        .eq("reviewer_id", user.id)
        .in("order_id", orderIds),
      admin.from("listings")
        .select("id, seller_id, title, slug")
        .in("id", listingIds),
    ]);
    if (paymentsResult.error) throw paymentsResult.error;
    if (reviewsResult.error) throw reviewsResult.error;
    if (listingsResult.error) throw listingsResult.error;

    const listingsById = new Map(
      (listingsResult.data ?? []).map((listing) => [listing.id, listing]),
    );
    const paidOrders = new Set(
      (paymentsResult.data ?? []).flatMap((payment) => {
        const order = orders.find((candidate) => candidate.id === payment.order_id);
        return order && amountInMinorUnits(order.amount) === amountInMinorUnits(payment.amount)
          ? [payment.order_id]
          : [];
      }),
    );
    const reviewedOrders = new Set((reviewsResult.data ?? []).map((review) => review.order_id));

    return orders.flatMap((order) => {
      const listing = listingsById.get(order.listing_id);
      if (
        !paidOrders.has(order.id)
        || reviewedOrders.has(order.id)
        || !listing
        || listing.seller_id !== seller.id
      ) {
        return [];
      }
      return [{
        orderId: order.id,
        listingId: listing.id,
        listingTitle: listing.title,
        listingSlug: listing.slug,
      }];
    });
  } catch {
    console.error("Eligible review purchases lookup failed.");
    throw new Error("Eligible purchases are temporarily unavailable.");
  }
}

export async function submitPurchaseReview(
  input: unknown,
): Promise<ReviewSubmissionResult> {
  const parsed = reviewSubmissionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Enter a rating from 1 to 5 and a comment of at most 1000 characters." };

  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Sign in to leave a review." };

    const supabase = await createSupabaseServerClient();
    const submission: ReviewSubmission = parsed.data;
    const { error } = await supabase.from("reviews").insert({
      order_id: submission.order_id,
      rating: submission.rating,
      comment: submission.comment,
    });
    if (error?.code === "23505") {
      return { success: false, error: "You have already reviewed this purchase." };
    }
    if (error?.code === "42501") {
      return { success: false, error: "This purchase is not eligible for a review." };
    }
    if (error) throw error;
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message === "This purchase is not eligible for a review.") {
      return { success: false, error: error.message };
    }
    console.error("Purchase review submission failed.");
    return { success: false, error: "Your review could not be submitted. Please try again." };
  }
}
