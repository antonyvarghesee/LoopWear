import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getCurrentUser,
  adminFrom,
  serverFrom,
} = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  adminFrom: vi.fn(),
  serverFrom: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/auth", () => ({ getCurrentUser }));

import {
  createNotification,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/notifications";
import {
  createNotificationSchema,
  NOTIFICATION_TYPES,
} from "@/lib/validations/notifications";

const userId = "00000000-0000-4000-8000-000000000001";
const notificationId = "00000000-0000-4000-8000-000000000002";

function setup() {
  const createMaybeSingle = vi.fn().mockResolvedValue({ data: { id: notificationId }, error: null });
  const adminSelect = vi.fn(() => ({ maybeSingle: createMaybeSingle }));
  const adminInsert = vi.fn(() => ({ select: adminSelect }));
  adminFrom.mockReturnValue({ insert: adminInsert });
  createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

  const range = vi.fn().mockResolvedValue({ data: [], error: null });
  const countQuery = {
    eq: vi.fn(),
    then: (resolve: (value: { count: number; error: null }) => unknown) => Promise.resolve({ count: 7, error: null }).then(resolve),
  };
  countQuery.eq.mockReturnValue(countQuery);
  const selectQuery = {
    eq: vi.fn(),
    order: vi.fn(() => ({ range })),
  };
  selectQuery.eq.mockReturnValue(selectQuery);
  const updateMaybeSingle = vi.fn().mockResolvedValue({ data: { id: notificationId }, error: null });
  const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
  const updateQuery = {
    eq: vi.fn(),
    select: updateSelect,
    then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  updateQuery.eq.mockReturnValue(updateQuery);
  serverFrom.mockReturnValue({
    select: vi.fn((_columns: string, options?: { head?: boolean }) => options?.head ? countQuery : selectQuery),
    update: vi.fn(() => updateQuery),
  });
  createSupabaseServerClient.mockResolvedValue({ from: serverFrom });
  getCurrentUser.mockResolvedValue({ id: userId });
  return { adminInsert, selectQuery, range, updateQuery, countQuery };
}

describe("notification validation and service", () => {
  beforeEach(() => {
    createSupabaseAdminClient.mockReset();
    createSupabaseServerClient.mockReset();
    getCurrentUser.mockReset();
    adminFrom.mockReset();
    serverFrom.mockReset();
  });

  it("centralizes the supported product notification types", () => {
    expect(NOTIFICATION_TYPES).toEqual(["message", "order", "payment", "delivery", "review", "trust_safety"]);
  });

  it("rejects invalid notification types, UUIDs, and unexpected fields", () => {
    expect(createNotificationSchema.safeParse({
      recipientId: "not-a-uuid",
      type: "arbitrary",
      title: "Hello",
      body: "World",
      reporter_id: userId,
    }).success).toBe(false);
    expect(createNotificationSchema.safeParse({
      recipientId: userId,
      type: "order",
      title: "Hello",
      body: "World",
      relatedEntityType: "order",
      relatedEntityId: "bad-id",
    }).success).toBe(false);
  });

  it("creates a notification through the trusted admin client with validated fields", async () => {
    const { adminInsert } = setup();
    await expect(createNotification({
      recipientId: userId,
      type: "delivery",
      title: "Item received",
      body: "Your order was marked delivered.",
      relatedEntityType: "order",
      relatedEntityId: notificationId,
    })).resolves.toEqual({ success: true });
    expect(adminInsert).toHaveBeenCalledWith({
      user_id: userId,
      type: "delivery",
      event_id: null,
      title: "Item received",
      message: "Your order was marked delivered.",
      link_url: null,
      related_entity_type: "order",
      related_entity_id: notificationId,
    });
  });

  it("treats an already-created idempotent event notification as success", async () => {
    const { adminInsert } = setup();
    adminInsert.mockReturnValueOnce({
      select: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { code: "23505" } }),
      })),
    });
    await expect(createNotification({
      recipientId: userId,
      type: "message",
      eventId: notificationId,
      title: "New message",
      body: "You received a new message.",
    })).resolves.toEqual({ success: true });
  });

  it("rejects invalid notification input before using the admin client", async () => {
    setup();
    await expect(createNotification({
      recipientId: userId,
      type: "unexpected",
      title: "Hello",
      body: "World",
    })).resolves.toMatchObject({ success: false });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated listing and read-state requests", async () => {
    setup();
    getCurrentUser.mockResolvedValue(null);
    await expect(listNotifications()).rejects.toThrow("Sign in to view your notifications.");
    await expect(markNotificationRead(notificationId)).resolves.toMatchObject({ success: false });
    expect(serverFrom).not.toHaveBeenCalled();
  });

  it("scopes notification reads to the authenticated recipient", async () => {
    const { selectQuery, range } = setup();
    await expect(listNotifications({ limit: 20, offset: 10 })).resolves.toEqual([]);
    expect(serverFrom).toHaveBeenCalledWith("notifications");
    expect(selectQuery.eq).toHaveBeenCalledWith("user_id", userId);
    expect(range).toHaveBeenCalledWith(10, 29);
  });

  it("gets the unread count for only the authenticated user", async () => {
    const { countQuery } = setup();
    await expect(getUnreadNotificationCount()).resolves.toBe(7);
    expect(countQuery.eq).toHaveBeenNthCalledWith(1, "user_id", userId);
    expect(countQuery.eq).toHaveBeenNthCalledWith(2, "is_read", false);
  });

  it("updates only read state for the authenticated user's notification", async () => {
    const { updateQuery } = setup();
    await expect(markNotificationRead(notificationId)).resolves.toEqual({ success: true });
    expect(updateQuery.eq).toHaveBeenNthCalledWith(1, "id", notificationId);
    expect(updateQuery.eq).toHaveBeenNthCalledWith(2, "user_id", userId);
  });

  it("marks all and only the authenticated user's unread notifications as read", async () => {
    const { updateQuery } = setup();
    await expect(markAllNotificationsRead()).resolves.toEqual({ success: true });
    expect(updateQuery.eq).toHaveBeenNthCalledWith(1, "user_id", userId);
    expect(updateQuery.eq).toHaveBeenNthCalledWith(2, "is_read", false);
  });

  it("rejects unauthenticated mark-all requests", async () => {
    setup();
    getCurrentUser.mockResolvedValue(null);
    await expect(markAllNotificationsRead()).resolves.toMatchObject({ success: false });
    expect(serverFrom).not.toHaveBeenCalled();
  });
});
