import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser } = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/auth", () => ({ getCurrentUser }));
vi.mock("@/services/listing-images", () => ({ getActiveListingPrimaryImageUrls: vi.fn().mockResolvedValue({}) }));

import { getConversation, getConversationMessages, getConversations, getOrCreateConversation, markConversationAsRead, sendMessage } from "@/services/messaging";

const buyerId = "00000000-0000-4000-8000-000000000001";
const sellerId = "00000000-0000-4000-8000-000000000002";
const listingId = "00000000-0000-4000-8000-000000000003";
const conversationId = "00000000-0000-4000-8000-000000000004";

function setup(options: {
  userId?: string | null;
  listing?: { id: string; seller_id: string } | null;
  conversation?: Record<string, unknown> | null;
  conversationRows?: Array<Record<string, unknown>>;
  messageRows?: Array<Record<string, unknown>>;
  insertedMessage?: Record<string, unknown>;
  readError?: { message: string } | null;
} = {}) {
  const listingQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  listingQuery.select.mockReturnValue(listingQuery);
  listingQuery.eq.mockReturnValue(listingQuery);
  listingQuery.maybeSingle.mockResolvedValue({ data: Object.hasOwn(options, "listing") ? options.listing : { id: listingId, seller_id: sellerId }, error: null });

  const messageQuery = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), insert: vi.fn(), single: vi.fn() };
  messageQuery.select.mockReturnValue(messageQuery);
  messageQuery.eq.mockReturnValue(messageQuery);
  messageQuery.order.mockReturnValue(messageQuery);
  messageQuery.range.mockResolvedValue({ data: options.messageRows ?? [], error: null });
  messageQuery.insert.mockReturnValue(messageQuery);
  messageQuery.single.mockResolvedValue({ data: options.insertedMessage ?? { id: "00000000-0000-4000-8000-000000000005", sender_id: buyerId, content: "Hello seller", is_read: false, created_at: "2026-10-04T10:00:00Z" }, error: null });

  const authorizedConversation = {
    maybeSingle: vi.fn().mockResolvedValue({ data: Object.hasOwn(options, "conversation") ? options.conversation : { conversation_id: conversationId, is_buyer: true, listing_id: listingId, listing_title: "Coat", listing_slug: "coat", listing_active: true }, error: null }),
  };
  const rpc = vi.fn((name: string) => {
    if (name === "get_messaging_conversations") return Promise.resolve({ data: options.conversationRows ?? [], error: null });
    if (name === "get_messaging_conversation") return authorizedConversation;
    if (name === "mark_messaging_conversation_read" && options.readError) return Promise.resolve({ data: null, error: options.readError });
    if (name === "mark_messaging_conversation_read") return Promise.resolve({ data: 1, error: null });
    return Promise.resolve({ data: conversationId, error: null });
  });
  const from = vi.fn((table: string) => table === "listings" ? listingQuery : messageQuery);
  createSupabaseServerClient.mockResolvedValue({ from, rpc });
  getCurrentUser.mockResolvedValue(options.userId === null ? null : { id: options.userId ?? buyerId });
  return { from, rpc, listingQuery, messageQuery, authorizedConversation };
}

describe("messaging service", () => {
  beforeEach(() => { createSupabaseServerClient.mockReset(); getCurrentUser.mockReset(); });

  it("requires authentication to start a conversation", async () => {
    const { listingQuery } = setup({ userId: null });
    expect(await getOrCreateConversation(listingId)).toMatchObject({ success: false, error: "Sign in to message this seller." });
    expect(listingQuery.maybeSingle).not.toHaveBeenCalled();
  });

  it("blocks anonymous inbox access", async () => {
    setup({ userId: null });
    await expect(getConversations()).rejects.toThrow("Sign in to view your messages.");
  });

  it("identifies unread conversations using the signed-in user's database projection", async () => {
    const { rpc } = setup({ conversationRows: [{ conversation_id: conversationId, listing_id: listingId, listing_title: "Coat", listing_slug: "coat", listing_active: true, other_username: "seller", other_full_name: "Seller", other_avatar_url: null, last_message_content: "Are you interested?", last_message_at: "2026-10-04T10:00:00Z", unread_count: 2 }] });
    const conversations = await getConversations();
    expect(conversations[0]?.unread_count).toBe(2);
    expect(rpc).toHaveBeenCalledWith("get_messaging_conversations");
  });

  it("creates or opens a conversation from listing ID only, letting SQL derive the seller and buyer", async () => {
    const { rpc, listingQuery } = setup();
    expect(await getOrCreateConversation(listingId)).toEqual({ success: true, conversationId });
    expect(listingQuery.eq).toHaveBeenNthCalledWith(2, "status", "ACTIVE");
    expect(rpc).toHaveBeenCalledWith("get_or_create_listing_conversation", { p_listing_id: listingId });
  });

  it("handles a duplicate conversation idempotently using the database unique key", async () => {
    const { rpc } = setup();
    expect(await getOrCreateConversation(listingId)).toEqual({ success: true, conversationId });
    expect(await getOrCreateConversation(listingId)).toEqual({ success: true, conversationId });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("rejects self-messaging and inactive or missing listings", async () => {
    setup({ listing: { id: listingId, seller_id: buyerId } });
    expect(await getOrCreateConversation(listingId)).toMatchObject({ success: false, error: "You cannot message yourself about your own listing." });
    setup({ listing: null });
    expect(await getOrCreateConversation(listingId)).toMatchObject({ success: false, error: "This listing is not available for messaging." });
  });

  it("rejects malformed listing IDs without a database call", async () => {
    setup();
    expect(await getOrCreateConversation("bad-id")).toMatchObject({ success: false });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("does not read messages when the current user is not a conversation participant", async () => {
    const { messageQuery } = setup({ conversation: null });
    expect(await getConversationMessages(conversationId)).toBeNull();
    expect(messageQuery.select).not.toHaveBeenCalled();
  });

  it("returns conversation details only to a participant", async () => {
    setup();
    expect(await getConversation(conversationId)).toMatchObject({ conversation_id: conversationId });
    setup({ conversation: null });
    expect(await getConversation(conversationId)).toBeNull();
  });

  it("returns bounded chronological message pages with sender identity derived server-side", async () => {
    const { messageQuery } = setup({ messageRows: [
      { id: "00000000-0000-4000-8000-000000000006", sender_id: sellerId, content: "Hi", is_read: false, created_at: "2026-10-04T10:01:00Z" },
      { id: "00000000-0000-4000-8000-000000000005", sender_id: buyerId, content: "Hello", is_read: false, created_at: "2026-10-04T10:00:00Z" },
    ] });
    const result = await getConversationMessages(conversationId);
    expect(result?.messages.map((message) => message.content)).toEqual(["Hello", "Hi"]);
    expect(result?.messages.map((message) => message.is_own)).toEqual([true, false]);
    expect(result?.messages[0]).not.toHaveProperty("sender_id");
    expect(messageQuery.range).toHaveBeenCalledWith(0, 49);
  });

  it("rejects anonymous message sends", async () => {
    setup({ userId: null });
    expect(await sendMessage(conversationId, "Hello")).toMatchObject({ success: false, error: "Sign in to send messages." });
  });

  it("does not send when conversation membership lookup returns no row", async () => {
    const { messageQuery } = setup({ conversation: null });
    expect(await sendMessage(conversationId, "Hello")).toMatchObject({ success: false, error: "This conversation could not be found." });
    expect(messageQuery.insert).not.toHaveBeenCalled();
  });

  it("trims valid messages and never accepts a client-controlled sender ID", async () => {
    const { messageQuery } = setup();
    expect(await sendMessage(conversationId, "  Hello seller  ")).toMatchObject({ success: true, message: { content: "Hello seller", is_own: true } });
    expect(messageQuery.insert).toHaveBeenCalledWith({ conversation_id: conversationId, content: "Hello seller" });
    expect(messageQuery.insert.mock.calls[0]?.[0]).not.toHaveProperty("sender_id");
  });

  it.each(["", "   ", "x".repeat(2001)])("rejects empty or oversized message bodies", async (body) => {
    const { messageQuery } = setup();
    expect(await sendMessage(conversationId, body)).toMatchObject({ success: false });
    expect(messageQuery.insert).not.toHaveBeenCalled();
  });

  it("marks only received messages read through the participant-checked database function", async () => {
    const { rpc } = setup();
    expect(await markConversationAsRead(conversationId)).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("mark_messaging_conversation_read", { p_conversation_id: conversationId });
  });

  it("fails safely when a non-participant attempts to mark a conversation read", async () => {
    setup({ readError: { message: "Conversation not found" } });
    expect(await markConversationAsRead(conversationId)).toMatchObject({ success: false, error: "Read status could not be updated." });
  });
});
