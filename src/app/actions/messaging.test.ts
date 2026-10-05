import { beforeEach, describe, expect, it, vi } from "vitest";

const { markConversationAsRead, revalidatePath } = vi.hoisted(() => ({ markConversationAsRead: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/services/messaging", () => ({ markConversationAsRead }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { markConversationReadAction } from "@/app/actions/messaging";

const conversationId = "00000000-0000-4000-8000-000000000004";

describe("markConversationReadAction", () => {
  beforeEach(() => { markConversationAsRead.mockReset(); revalidatePath.mockReset(); });

  it("clears incoming unread state on open and revalidates the inbox after success", async () => {
    markConversationAsRead.mockResolvedValue({ success: true });
    expect(await markConversationReadAction({ conversationId })).toEqual({ success: true });
    expect(markConversationAsRead).toHaveBeenCalledWith(conversationId);
    expect(revalidatePath).toHaveBeenCalledWith("/messages");
  });

  it("does not revalidate or report success if a non-participant cannot mark the thread read", async () => {
    markConversationAsRead.mockResolvedValue({ success: false, error: "Read status could not be updated." });
    expect(await markConversationReadAction({ conversationId })).toEqual({ success: false, error: "Read status could not be updated." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects malformed conversation IDs before calling the read service", async () => {
    expect(await markConversationReadAction({ conversationId: "not-a-uuid" })).toMatchObject({ success: false });
    expect(markConversationAsRead).not.toHaveBeenCalled();
  });
});
