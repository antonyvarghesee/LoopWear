import { z } from "zod";
import { messagingIdSchema } from "@/lib/validations/messaging";

export const realtimeMessageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: messagingIdSchema,
  sender_id: z.string().uuid(),
  content: z.string(),
  is_read: z.boolean(),
  created_at: z.string(),
});

export function conversationMessageFilter(conversationId: string) {
  return messagingIdSchema.safeParse(conversationId).success
    ? `conversation_id=eq.${conversationId}`
    : null;
}

export function shouldRefreshInboxForMessage(
  message: { sender_id: string },
  currentUserId: string,
) {
  return message.sender_id !== currentUserId;
}

export function refreshInboxForIncomingMessage(
  message: { conversation_id: unknown; sender_id: unknown },
  currentUserId: string,
  refresh: () => void,
) {
  if (typeof message.conversation_id !== "string" || typeof message.sender_id !== "string") return false;
  if (!shouldRefreshInboxForMessage(message as { sender_id: string }, currentUserId)) return false;
  refresh();
  return true;
}

export function appendUniqueMessage<T extends { id: string }>(messages: T[], message: T): T[] {
  return messages.some((existing) => existing.id === message.id) ? messages : [...messages, message];
}
