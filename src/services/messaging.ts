import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getCurrentUser } from "@/services/auth";
import { getActiveListingPrimaryImageUrls } from "@/services/listing-images";
import { notifyMessageSent } from "@/services/notification-events";
import {
  MESSAGE_PAGE_SIZE,
  messagingIdSchema,
  sendMessageInputSchema,
} from "@/lib/validations/messaging";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type MessagingContext = { user: { id: string }; supabase: Supabase };

export type ConversationSummary = {
  conversation_id: string;
  listing_id: string | null;
  listing_title: string | null;
  listing_slug: string | null;
  listing_active: boolean;
  other_username: string | null;
  other_full_name: string | null;
  other_avatar_url: string | null;
  last_message_content: string | null;
  last_message_at: string | null;
  unread_count: number;
  listing_image_url: string | null;
};

export type ConversationDetails = {
  conversation_id: string;
  is_buyer: boolean;
  listing_id: string | null;
  listing_title: string | null;
  listing_slug: string | null;
  listing_active: boolean;
  other_username: string | null;
  other_full_name: string | null;
  other_avatar_url: string | null;
  listing_image_url: string | null;
};

export type ConversationMessage = {
  id: string;
  content: string;
  created_at: string;
  is_read: boolean;
  is_own: boolean;
};

export type MessagePage = { messages: ConversationMessage[]; hasMore: boolean; nextOffset: number };

async function messagingContext(): Promise<MessagingContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!isSupabaseConfigured()) throw new Error("Messaging is temporarily unavailable.");
  return { user, supabase: await createSupabaseServerClient() };
}

async function signConversationImage(listingId: string | null, isActive: boolean): Promise<string | null> {
  if (!listingId || !isActive) return null;
  try {
    return (await getActiveListingPrimaryImageUrls([listingId]))[listingId] ?? null;
  } catch (error) {
    console.error("Conversation listing image could not be signed:", error);
    return null;
  }
}

function safeReadError(label: string, error: unknown): Error {
  console.error(`${label}:`, error);
  return new Error("Messages are temporarily unavailable. Please try again.");
}

export async function getConversations(): Promise<ConversationSummary[]> {
  const context = await messagingContext();
  if (!context) throw new Error("Sign in to view your messages.");
  const { data, error } = await context.supabase.rpc("get_messaging_conversations");
  if (error) throw safeReadError("Conversation list lookup failed", error);
  const rows = (data ?? []) as Omit<ConversationSummary, "listing_image_url">[];
  const listingIds = [...new Set(rows.filter((row) => row.listing_active && row.listing_id).map((row) => row.listing_id as string))];
  const imageBatches = await Promise.all(Array.from({ length: Math.ceil(listingIds.length / 24) }, async (_, index) => {
    try {
      return await getActiveListingPrimaryImageUrls(listingIds.slice(index * 24, index * 24 + 24));
    } catch (imageError) {
      console.error("Conversation listing thumbnails could not be signed:", imageError);
      return {};
    }
  }));
  const images = Object.assign({}, ...imageBatches);
  return rows.map((row) => ({ ...row, unread_count: Number(row.unread_count) || 0, listing_image_url: row.listing_id ? images[row.listing_id] ?? null : null }));
}

async function getAuthorizedConversationRow(context: MessagingContext, conversationId: string): Promise<Omit<ConversationDetails, "listing_image_url"> | null> {
  const { data, error } = await context.supabase.rpc("get_messaging_conversation", { p_conversation_id: conversationId }).maybeSingle();
  if (error) throw safeReadError("Conversation lookup failed", error);
  if (!data) return null;
  return data as Omit<ConversationDetails, "listing_image_url">;
}

async function getAuthorizedConversation(context: MessagingContext, conversationId: string): Promise<ConversationDetails | null> {
  const row = await getAuthorizedConversationRow(context, conversationId);
  if (!row) return null;
  return { ...row, listing_image_url: await signConversationImage(row.listing_id, row.listing_active) };
}

async function queryMessages(context: MessagingContext, conversationId: string, offset: number): Promise<MessagePage> {
  const { data, error } = await context.supabase.from("messages")
    .select("id,conversation_id,sender_id,content,is_read,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + MESSAGE_PAGE_SIZE - 1);
  if (error) throw safeReadError("Conversation messages lookup failed", error);
  const rows = (data ?? []) as Array<{ id: string; sender_id: string; content: string; is_read: boolean; created_at: string }>;
  const messages = rows.reverse().map((message) => ({
    id: message.id,
    content: message.content,
    is_read: message.is_read,
    created_at: message.created_at,
    is_own: message.sender_id === context.user.id,
  }));
  return { messages, hasMore: rows.length === MESSAGE_PAGE_SIZE, nextOffset: offset + rows.length };
}

export async function getConversation(conversationId: unknown): Promise<ConversationDetails | null> {
  const parsed = messagingIdSchema.safeParse(conversationId);
  if (!parsed.success) return null;
  const context = await messagingContext();
  if (!context) throw new Error("Sign in to view this conversation.");
  return getAuthorizedConversation(context, parsed.data);
}

export async function getConversationMessages(conversationId: unknown, offset = 0): Promise<MessagePage | null> {
  const parsed = messagingIdSchema.safeParse(conversationId);
  if (!parsed.success || !Number.isInteger(offset) || offset < 0 || offset > 5000) return null;
  const context = await messagingContext();
  if (!context) throw new Error("Sign in to view this conversation.");
  if (!await getAuthorizedConversationRow(context, parsed.data)) return null;
  return queryMessages(context, parsed.data, offset);
}

export async function getConversationPage(conversationId: unknown): Promise<{ conversation: ConversationDetails; messages: MessagePage; currentUserId: string } | null> {
  const parsed = messagingIdSchema.safeParse(conversationId);
  if (!parsed.success) return null;
  const context = await messagingContext();
  if (!context) throw new Error("Sign in to view this conversation.");
  const conversation = await getAuthorizedConversation(context, parsed.data);
  if (!conversation) return null;
  const messages = await queryMessages(context, parsed.data, 0);
  return { conversation, messages, currentUserId: context.user.id };
}

export async function getOrCreateConversation(listingId: unknown): Promise<{ success: true; conversationId: string } | { success: false; error: string }> {
  const parsed = messagingIdSchema.safeParse(listingId);
  if (!parsed.success) return { success: false, error: "This listing could not be found." };
  const context = await messagingContext();
  if (!context) return { success: false, error: "Sign in to message this seller." };

  const { data: listing, error: listingError } = await context.supabase.from("listings")
    .select("id,seller_id").eq("id", parsed.data).eq("status", "ACTIVE").maybeSingle();
  if (listingError) {
    console.error("Message listing lookup failed:", listingError);
    return { success: false, error: "This listing is not available for messaging." };
  }
  if (!listing) return { success: false, error: "This listing is not available for messaging." };
  if (listing.seller_id === context.user.id) return { success: false, error: "You cannot message yourself about your own listing." };

  const { data, error } = await context.supabase.rpc("get_or_create_listing_conversation", { p_listing_id: parsed.data });
  if (error || typeof data !== "string") {
    if (error?.code === "42501") {
      return { success: false, error: "Messaging is unavailable for this user." };
    }
    console.error("Conversation creation failed:", error ?? "No conversation ID returned");
    return { success: false, error: "A conversation could not be opened. Please try again." };
  }
  return { success: true, conversationId: data };
}

export async function sendMessage(conversationId: unknown, body: unknown): Promise<{ success: true; message: ConversationMessage } | { success: false; error: string }> {
  const parsed = sendMessageInputSchema.safeParse({ conversationId, body });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Write a valid message before sending." };
  const context = await messagingContext();
  if (!context) return { success: false, error: "Sign in to send messages." };
  try {
    if (!await getAuthorizedConversationRow(context, parsed.data.conversationId)) return { success: false, error: "This conversation could not be found." };
    const { data: canSend, error: permissionError } = await context.supabase.rpc(
      "can_send_conversation_message",
      { p_conversation_id: parsed.data.conversationId },
    );
    if (permissionError) {
      console.error("Conversation send permission lookup failed.");
      return { success: false, error: "Messaging is temporarily unavailable. Please try again." };
    }
    if (canSend !== true) {
      return { success: false, error: "Messaging is unavailable for this user." };
    }
    const { data, error } = await context.supabase.from("messages")
      .insert({ conversation_id: parsed.data.conversationId, content: parsed.data.body })
      .select("id,sender_id,content,is_read,created_at")
      .single();
    if (error || !data) {
      console.error("Message insert failed:", error ?? "No message returned");
      return { success: false, error: "Your message could not be sent. Please try again." };
    }
    try {
      await notifyMessageSent(data.id);
    } catch {
      console.error("Notification event generation failed: message sent.");
    }
    return { success: true, message: { id: data.id, content: data.content, is_read: data.is_read, created_at: data.created_at, is_own: data.sender_id === context.user.id } };
  } catch (error) {
    console.error("Message send failed:", error);
    return { success: false, error: "Your message could not be sent. Please try again." };
  }
}

export async function markConversationAsRead(conversationId: unknown): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = messagingIdSchema.safeParse(conversationId);
  if (!parsed.success) return { success: false, error: "This conversation could not be found." };
  const context = await messagingContext();
  if (!context) return { success: false, error: "Sign in to read messages." };
  const { error } = await context.supabase.rpc("mark_messaging_conversation_read", { p_conversation_id: parsed.data });
  if (error) {
    console.error("Mark conversation read failed:", error);
    return { success: false, error: "Read status could not be updated." };
  }
  return { success: true };
}
