import { describe, expect, it, vi } from "vitest";
import { appendUniqueMessage, conversationMessageFilter, realtimeMessageSchema, refreshInboxForIncomingMessage } from "@/lib/messaging/realtime";

describe("messaging Realtime helpers", () => {
  it("filters subscriptions to one valid conversation", () => {
    expect(conversationMessageFilter("00000000-0000-4000-8000-000000000001")).toBe("conversation_id=eq.00000000-0000-4000-8000-000000000001");
    expect(conversationMessageFilter("not-a-uuid")).toBeNull();
  });

  it("validates incoming row shape and deduplicates messages by ID", () => {
    const message = { id: "00000000-0000-4000-8000-000000000002", conversation_id: "00000000-0000-4000-8000-000000000001", sender_id: "00000000-0000-4000-8000-000000000003", content: "Hello", is_read: false, created_at: "2026-10-04T10:00:00Z" };
    expect(realtimeMessageSchema.safeParse(message).success).toBe(true);
    expect(realtimeMessageSchema.safeParse({ ...message, conversation_id: "invalid" }).success).toBe(false);
    expect(appendUniqueMessage([message], message)).toHaveLength(1);
  });

  it("refreshes the inbox for a received message, including one in a conversation created after the inbox loaded", () => {
    const conversationId = "00000000-0000-4000-8000-000000000001";
    const currentUserId = "00000000-0000-4000-8000-000000000003";
    const refresh = vi.fn();

    expect(refreshInboxForIncomingMessage({ conversation_id: conversationId, sender_id: "00000000-0000-4000-8000-000000000004" }, currentUserId, refresh)).toBe(true);
    expect(refreshInboxForIncomingMessage({ conversation_id: "00000000-0000-4000-8000-000000000005", sender_id: "00000000-0000-4000-8000-000000000004" }, currentUserId, refresh)).toBe(true);
    expect(refreshInboxForIncomingMessage({ conversation_id: conversationId, sender_id: currentUserId }, currentUserId, refresh)).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
