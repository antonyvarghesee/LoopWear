"use server";

import { revalidatePath } from "next/cache";
import { reviewSubmissionSchema } from "@/lib/validations/reviews";
import { submitPurchaseReview } from "@/services/reviews";

export type ReviewActionState =
  | { status: "success"; message: string }
  | { status: "error"; message: string }
  | null;

export async function submitPurchaseReviewAction(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const rawFields = Object.fromEntries(formData.entries());
  const parsed = reviewSubmissionSchema.safeParse(rawFields);
  if (!parsed.success) {
    return { status: "error", message: "Choose a rating from 1 to 5 and enter a comment of at most 1000 characters." };
  }

  let result: Awaited<ReturnType<typeof submitPurchaseReview>>;
  try {
    result = await submitPurchaseReview(parsed.data);
  } catch {
    return { status: "error", message: "Your review could not be submitted. Please try again." };
  }
  if (!result.success) return { status: "error", message: result.error };

  revalidatePath("/seller/[username]", "page");
  revalidatePath("/listing/[slug]", "page");
  return { status: "success", message: "Thanks — your review has been submitted." };
}
