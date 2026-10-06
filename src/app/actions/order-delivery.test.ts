import { beforeEach, describe, expect, it, vi } from "vitest";

const { confirmOrderDelivery, revalidatePath } = vi.hoisted(() => ({
  confirmOrderDelivery: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/services/order-delivery", () => ({ confirmOrderDelivery }));

import { confirmOrderDeliveryAction } from "@/app/actions/order-delivery";

describe("confirmOrderDeliveryAction", () => {
  beforeEach(() => {
    confirmOrderDelivery.mockReset().mockResolvedValue({ success: true });
    revalidatePath.mockReset();
  });

  it("confirms by order ID and refreshes order and review pages", async () => {
    const orderId = "00000000-0000-4000-8000-000000000002";
    await expect(confirmOrderDeliveryAction(orderId)).resolves.toEqual({ success: true });
    expect(confirmOrderDelivery).toHaveBeenCalledWith(orderId);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/orders");
    expect(revalidatePath).toHaveBeenCalledWith("/seller/[username]", "page");
  });

  it("does not revalidate after a rejected confirmation", async () => {
    confirmOrderDelivery.mockResolvedValueOnce({
      success: false,
      error: "This order is not available for delivery confirmation.",
    });
    await expect(confirmOrderDeliveryAction("order-id")).resolves.toMatchObject({ success: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
