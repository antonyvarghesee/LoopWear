import { describe, expect, it } from "vitest";
import { notificationRecipientFilter, notificationRealtimeSchema } from "@/lib/notifications/realtime";

const userId = "00000000-0000-4000-8000-000000000001";

describe("notification realtime helpers", () => {
  it("builds a recipient-only filter for a valid user ID", () => {
    expect(notificationRecipientFilter(userId)).toBe(`user_id=eq.${userId}`);
  });

  it("rejects an invalid recipient before subscribing", () => {
    expect(notificationRecipientFilter("invalid")).toBeNull();
  });

  it("validates notification realtime rows and rejects unrelated identities", () => {
    const row = {
      id: "00000000-0000-4000-8000-000000000002",
      user_id: userId,
      type: "message",
      event_id: null,
      title: "New message",
      message: "You received a message.",
      link_url: null,
      related_entity_type: null,
      related_entity_id: null,
      is_read: false,
      created_at: "2026-10-06T10:00:00Z",
      read_at: null,
    };
    expect(notificationRealtimeSchema.safeParse(row).success).toBe(true);
    expect(notificationRealtimeSchema.safeParse({ ...row, user_id: "invalid" }).success).toBe(false);
  });
});
