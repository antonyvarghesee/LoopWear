import { z } from "zod";

export const NOTIFICATION_TYPES = [
  "message",
  "order",
  "payment",
  "delivery",
  "review",
  "trust_safety",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const LEGACY_NOTIFICATION_TYPES = [
  "order_status",
  "favorite_price_drop",
  "system",
] as const;

export type StoredNotificationType = NotificationType | (typeof LEGACY_NOTIFICATION_TYPES)[number];

export const NOTIFICATION_RELATED_ENTITY_TYPES = [
  "user",
  "listing",
  "conversation",
  "message",
  "order",
  "payment",
  "review",
  "report",
] as const;

export type NotificationRelatedEntityType = (typeof NOTIFICATION_RELATED_ENTITY_TYPES)[number];

export const createNotificationSchema = z.object({
  recipientId: z.string().uuid(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(2000),
  relatedEntityType: z.enum(NOTIFICATION_RELATED_ENTITY_TYPES).optional().nullable(),
  relatedEntityId: z.string().uuid().optional().nullable(),
  linkUrl: z.string().trim().max(2048).optional().nullable(),
}).strict().refine(
  (value) => Boolean(value.relatedEntityType) === Boolean(value.relatedEntityId),
  { message: "Related entity type and ID must be provided together." },
);

export const listNotificationsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(30),
  offset: z.number().int().min(0).max(10000).default(0),
}).strict();

export const notificationIdSchema = z.string().uuid();

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
