import { beforeEach, describe, expect, it, vi } from "vitest";

const { markOrderShipped, revalidatePath } = vi.hoisted(() => ({
  markOrderShipped: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/services/order-delivery", () => ({ markOrderShipped }));

import { markOrderShippedAction } from "@/app/actions/order-fulfillment";

describe("markOrderShippedAction", () => {
  beforeEach(() => {
    markOrderShipped.mockReset().mockResolvedValue({ success: true });
    revalidatePath.mockReset();
  });

  it("forwards only the order ID and refreshes the seller/buyer order view", async () => {
    const orderId = "00000000-0000-4000-8000-000000000002";
    await expect(markOrderShippedAction(orderId)).resolves.toEqual({ success: true });
    expect(markOrderShipped).toHaveBeenCalledWith(orderId);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/orders");
  });

  it("refreshes the order status after a rejected transition to resolve stale state", async () => {
    markOrderShipped.mockResolvedValueOnce({
      success: false,
      error: "This order is not available to mark as shipped.",
    });
    await expect(markOrderShippedAction("order-id")).resolves.toMatchObject({ success: false });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/orders");
  });
});
