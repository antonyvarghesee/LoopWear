"use server";

import { revalidatePath } from "next/cache";
import { conversationInputSchema, listingConversationInputSchema, olderMessagesInputSchema, sendMessageInputSchema } from "@/lib/validations/messaging";
import { getConversationMessages, getOrCreateConversation, markConversationAsRead, sendMessage } from "@/services/messaging";

export async function startConversationAction(input: unknown) {
  const parsed = listingConversationInputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "This listing could not be found." };
  try {
    const result = await getOrCreateConversation(parsed.data.listingId);
    if (!result.success) return result;
    revalidatePath("/messages");
    return result;
  } catch (error) {
    console.error("Start conversation action failed:", error);
    return { success: false as const, error: "A conversation could not be opened. Please try again." };
  }
}

export async function sendMessageAction(input: unknown) {
  const parsed = sendMessageInputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? "Write a valid message before sending." };
  try {
    const result = await sendMessage(parsed.data.conversationId, parsed.data.body);
    if (!result.success) return result;
    revalidatePath("/messages");
    revalidatePath(`/messages/${parsed.data.conversationId}`);
    return result;
  } catch (error) {
    console.error("Send message action failed:", error);
    return { success: false as const, error: "Your message could not be sent. Please try again." };
  }
}

export async function markConversationReadAction(input: unknown) {
  const parsed = conversationInputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "This conversation could not be found." };
  try {
    const result = await markConversationAsRead(parsed.data.conversationId);
    if (result.success) revalidatePath("/messages");
    return result;
  } catch (error) {
    console.error("Mark conversation read action failed:", error);
    return { success: false as const, error: "Read status could not be updated." };
  }
}

export async function loadOlderMessagesAction(input: unknown) {
  const parsed = olderMessagesInputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Older messages could not be loaded." };
  try {
    const result = await getConversationMessages(parsed.data.conversationId, parsed.data.offset);
    if (!result) return { success: false as const, error: "This conversation could not be found." };
    return { success: true as const, ...result };
  } catch (error) {
    console.error("Load older messages action failed:", error);
    return { success: false as const, error: "Older messages could not be loaded." };
  }
}
