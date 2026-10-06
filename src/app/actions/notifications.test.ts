import { beforeEach, describe, expect, it, vi } from "vitest";

const { listNotifications, markNotificationRead, markAllNotificationsRead, revalidatePath } = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/services/notifications", () => ({
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
}));

import {
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";

const notificationId = "00000000-0000-4000-8000-000000000002";

describe("notification actions", () => {
  beforeEach(() => {
    listNotifications.mockReset().mockResolvedValue([]);
    markNotificationRead.mockReset().mockResolvedValue({ success: true });
    markAllNotificationsRead.mockReset().mockResolvedValue({ success: true });
    revalidatePath.mockReset();
  });

  it("validates list pagination and rejects extra recipient identity", async () => {
    await expect(listNotificationsAction({ recipientId: notificationId })).resolves.toMatchObject({ success: false });
    expect(listNotifications).not.toHaveBeenCalled();
    await expect(listNotificationsAction({ limit: 10, offset: 0 })).resolves.toEqual({ success: true, notifications: [] });
    expect(listNotifications).toHaveBeenCalledWith({ limit: 10, offset: 0 });
  });

  it("validates read IDs and delegates only the notification ID", async () => {
    await expect(markNotificationReadAction({ id: notificationId, recipientId: notificationId })).resolves.toMatchObject({ success: false });
    expect(markNotificationRead).not.toHaveBeenCalled();
    await expect(markNotificationReadAction(notificationId)).resolves.toEqual({ success: true });
    expect(markNotificationRead).toHaveBeenCalledWith(notificationId);
  });

  it("delegates mark-all to the authenticated service operation", async () => {
    await expect(markAllNotificationsReadAction()).resolves.toEqual({ success: true });
    expect(markAllNotificationsRead).toHaveBeenCalledOnce();
  });
});
