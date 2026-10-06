import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createNotificationSchema,
  listNotificationsSchema,
  notificationIdSchema,
  type NotificationRelatedEntityType,
  type StoredNotificationType,
} from "@/lib/validations/notifications";
import { getCurrentUser } from "@/services/auth";

export type Notification = {
  id: string;
  user_id: string;
  type: StoredNotificationType;
  event_id: string | null;
  title: string;
  message: string;
  link_url: string | null;
  related_entity_type: NotificationRelatedEntityType | null;
  related_entity_id: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
};

export type NotificationResult =
  | { success: true }
  | { success: false; error: string };

export async function createNotification(input: unknown): Promise<NotificationResult> {
  const parsed = createNotificationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "The notification details are invalid." };

  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("notifications")
      .insert({
        user_id: parsed.data.recipientId,
        type: parsed.data.type,
        event_id: parsed.data.eventId ?? null,
        title: parsed.data.title,
        message: parsed.data.body,
        link_url: parsed.data.linkUrl ?? null,
        related_entity_type: parsed.data.relatedEntityType ?? null,
        related_entity_id: parsed.data.relatedEntityId ?? null,
      })
      .select("id")
      .maybeSingle();
    if (error || !data) {
      if (error?.code === "23505" && parsed.data.eventId) return { success: true };
      console.error("Notification creation failed.");
      return { success: false, error: "The notification could not be created." };
    }
    return { success: true };
  } catch {
    console.error("Notification creation failed.");
    return { success: false, error: "The notification could not be created." };
  }
}

export async function listNotifications(input: unknown = {}): Promise<Notification[]> {
  const parsed = listNotificationsSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid notifications query.");

  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in to view your notifications.");

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("id,user_id,type,event_id,title,message,link_url,related_entity_type,related_entity_id,is_read,created_at,read_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(parsed.data.offset, parsed.data.offset + parsed.data.limit - 1);
    if (error) throw error;
    return (data ?? []) as Notification[];
  } catch {
    console.error("Notifications lookup failed.");
    throw new Error("Notifications are temporarily unavailable.");
  }
}

export async function markNotificationRead(input: unknown): Promise<NotificationResult> {
  const parsedId = notificationIdSchema.safeParse(input);
  if (!parsedId.success) return { success: false, error: "This notification could not be found." };

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Sign in to update notifications." };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", parsedId.data)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return { success: false, error: "This notification could not be found." };
    return { success: true };
  } catch {
    console.error("Notification read state update failed.");
    return { success: false, error: "The notification could not be updated." };
  }
}
