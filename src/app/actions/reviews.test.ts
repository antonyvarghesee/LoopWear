import { beforeEach, describe, expect, it, vi } from "vitest";

const { submitPurchaseReview, revalidatePath } = vi.hoisted(() => ({
  submitPurchaseReview: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/services/reviews", () => ({ submitPurchaseReview }));

import { submitPurchaseReviewAction } from "@/app/actions/reviews";

describe("submitPurchaseReviewAction", () => {
  beforeEach(() => {
    submitPurchaseReview.mockReset().mockResolvedValue({ success: true });
    revalidatePath.mockReset();
  });

  it("accepts only order ID, rating, and optional comment then refreshes review surfaces", async () => {
    const formData = new FormData();
    formData.set("order_id", "00000000-0000-4000-8000-000000000001");
    formData.set("rating", "4");
    formData.set("comment", "Well packaged.");

    await expect(submitPurchaseReviewAction(null, formData)).resolves.toEqual({
      status: "success",
      message: "Thanks — your review has been submitted.",
    });
    expect(submitPurchaseReview).toHaveBeenCalledWith({
      order_id: "00000000-0000-4000-8000-000000000001",
      rating: 4,
      comment: "Well packaged.",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/seller/[username]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/listing/[slug]", "page");
  });

  it("rejects extraneous relationship fields before reaching the service", async () => {
    const formData = new FormData();
    formData.set("order_id", "00000000-0000-4000-8000-000000000001");
    formData.set("rating", "5");
    formData.set("seller_id", "attacker");

    await expect(submitPurchaseReviewAction(null, formData)).resolves.toMatchObject({ status: "error" });
    expect(submitPurchaseReview).not.toHaveBeenCalled();
  });

  it("returns service errors without reporting success or revalidating", async () => {
    submitPurchaseReview.mockResolvedValueOnce({
      success: false,
      error: "You have already reviewed this purchase.",
    });
    const formData = new FormData();
    formData.set("order_id", "00000000-0000-4000-8000-000000000001");
    formData.set("rating", "5");

    await expect(submitPurchaseReviewAction(null, formData)).resolves.toEqual({
      status: "error",
      message: "You have already reviewed this purchase.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
