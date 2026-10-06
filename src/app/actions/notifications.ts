"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { listNotificationsSchema } from "@/lib/validations/notifications";
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/notifications";

export async function getUnreadNotificationCountAction() {
  try {
    return { success: true as const, count: await getUnreadNotificationCount() };
  } catch {
    return { success: false as const, error: "Notifications are temporarily unavailable." };
  }
}

export async function listNotificationsAction(input: unknown = {}) {
  const parsed = listNotificationsSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Notifications could not be loaded." };

  try {
    return { success: true as const, notifications: await listNotifications(parsed.data) };
  } catch {
    return { success: false as const, error: "Notifications are temporarily unavailable." };
  }
}

export async function markNotificationReadAction(input: unknown) {
  const parsed = z.string().uuid().safeParse(input);
  if (!parsed.success) return { success: false as const, error: "This notification could not be found." };

  try {
    const result = await markNotificationRead(parsed.data);
    if (result.success) {
      revalidatePath("/notifications");
      revalidatePath("/", "layout");
    }
    return result;
  } catch {
    return { success: false as const, error: "The notification could not be updated." };
  }
}

export async function markAllNotificationsReadAction() {
  try {
    const result = await markAllNotificationsRead();
    if (result.success) {
      revalidatePath("/notifications");
      revalidatePath("/", "layout");
    }
    return result;
  } catch {
    return { success: false as const, error: "Notifications could not be updated." };
  }
}
