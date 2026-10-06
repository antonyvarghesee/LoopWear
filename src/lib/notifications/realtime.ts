import { z } from "zod";
import { NOTIFICATION_RELATED_ENTITY_TYPES, NOTIFICATION_TYPES, LEGACY_NOTIFICATION_TYPES } from "@/lib/validations/notifications";

const storedTypes = [...NOTIFICATION_TYPES, ...LEGACY_NOTIFICATION_TYPES] as const;

export const NOTIFICATION_READ_STATE_CHANGED_EVENT = "loopwear:notification-read-state-changed";

export const notificationRealtimeSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  type: z.enum(storedTypes),
  event_id: z.string().uuid().nullable(),
  title: z.string(),
  message: z.string(),
  link_url: z.string().nullable(),
  related_entity_type: z.enum(NOTIFICATION_RELATED_ENTITY_TYPES).nullable(),
  related_entity_id: z.string().uuid().nullable(),
  is_read: z.boolean(),
  created_at: z.string(),
  read_at: z.string().nullable(),
});

export function notificationRecipientFilter(userId: string): string | null {
  return z.string().uuid().safeParse(userId).success
    ? `user_id=eq.${userId}`
    : null;
}
