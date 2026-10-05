import { describe, expect, it } from "vitest";
import { listingConversationInputSchema, olderMessagesInputSchema, sendMessageInputSchema } from "@/lib/validations/messaging";

const conversationId = "00000000-0000-4000-8000-000000000001";

describe("messaging validation", () => {
  it("accepts a valid listing conversation request without participant IDs", () => {
    expect(listingConversationInputSchema.safeParse({ listingId: conversationId }).success).toBe(true);
    expect(listingConversationInputSchema.safeParse({ listingId: conversationId, sellerId: conversationId }).success).toBe(false);
  });

  it("trims valid messages and rejects blank, malformed, and oversized messages", () => {
    expect(sendMessageInputSchema.parse({ conversationId, body: "  Hello  " }).body).toBe("Hello");
    expect(sendMessageInputSchema.safeParse({ conversationId, body: "   " }).success).toBe(false);
    expect(sendMessageInputSchema.safeParse({ conversationId, body: "x".repeat(2001) }).success).toBe(false);
    expect(sendMessageInputSchema.safeParse({ conversationId: "bad", body: "Hello" }).success).toBe(false);
  });

  it("bounds older-message pagination to fixed page increments", () => {
    expect(olderMessagesInputSchema.safeParse({ conversationId, offset: 50 }).success).toBe(true);
    expect(olderMessagesInputSchema.safeParse({ conversationId, offset: 51 }).success).toBe(false);
  });
});
