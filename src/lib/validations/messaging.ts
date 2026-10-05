import { z } from "zod";

export const MESSAGE_MAX_LENGTH = 2000;
export const MESSAGE_PAGE_SIZE = 50;

export const messagingIdSchema = z.string().uuid("This conversation could not be found.");
export const listingConversationInputSchema = z.object({ listingId: z.string().uuid("This listing could not be found.") }).strict();
export const conversationInputSchema = z.object({ conversationId: messagingIdSchema }).strict();
export const sendMessageInputSchema = z.object({
  conversationId: messagingIdSchema,
  body: z.string().trim().min(1, "Write a message before sending.").max(MESSAGE_MAX_LENGTH, `Messages must be ${MESSAGE_MAX_LENGTH} characters or fewer.`),
}).strict();
export const olderMessagesInputSchema = z.object({
  conversationId: messagingIdSchema,
  offset: z.number().int().min(MESSAGE_PAGE_SIZE).max(5000).multipleOf(MESSAGE_PAGE_SIZE),
}).strict();

export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;
