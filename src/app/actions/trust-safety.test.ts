import { beforeEach, describe, expect, it, vi } from "vitest";

const { submitTrustSafetyReport, setUserBlock, revalidatePath } = vi.hoisted(() => ({
  submitTrustSafetyReport: vi.fn(),
  setUserBlock: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/services/trust-safety", () => ({ submitTrustSafetyReport, setUserBlock }));

import {
  setUserBlockAction,
  submitTrustSafetyReportAction,
} from "@/app/actions/trust-safety";

describe("trust and safety actions", () => {
  beforeEach(() => {
    submitTrustSafetyReport.mockReset().mockResolvedValue({ success: true });
    setUserBlock.mockReset().mockResolvedValue({ success: true });
    revalidatePath.mockReset();
  });

  it("validates reports and does not accept reporter or moderation fields", async () => {
    await expect(submitTrustSafetyReportAction({
      targetType: "listing",
      targetId: "00000000-0000-4000-8000-000000000001",
      reason: "fraud",
      status: "resolved",
      reporter_id: "00000000-0000-4000-8000-000000000002",
    })).resolves.toMatchObject({ success: false });
    expect(submitTrustSafetyReport).not.toHaveBeenCalled();
  });

  it("validates block requests and sends only target user ID and desired block state", async () => {
    const userId = "00000000-0000-4000-8000-000000000001";
    await expect(setUserBlockAction({ userId, blocked: true })).resolves.toEqual({ success: true });
    expect(setUserBlock).toHaveBeenCalledWith(userId, true);
    expect(revalidatePath).toHaveBeenCalledWith("/messages/[conversationId]", "page");
  });
});
