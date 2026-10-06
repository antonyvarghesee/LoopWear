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
  listNotifications,
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
  const selectQuery = {
    eq: vi.fn(),
    order: vi.fn(() => ({ range })),
  };
  selectQuery.eq.mockReturnValue(selectQuery);
  const updateMaybeSingle = vi.fn().mockResolvedValue({ data: { id: notificationId }, error: null });
  const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
  const updateQuery = { eq: vi.fn(), select: updateSelect };
  updateQuery.eq.mockReturnValue(updateQuery);
  serverFrom.mockReturnValue({
    select: vi.fn(() => selectQuery),
    update: vi.fn(() => updateQuery),
  });
  createSupabaseServerClient.mockResolvedValue({ from: serverFrom });
  getCurrentUser.mockResolvedValue({ id: userId });
  return { adminInsert, selectQuery, range, updateQuery };
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
      title: "Item received",
      message: "Your order was marked delivered.",
      link_url: null,
      related_entity_type: "order",
      related_entity_id: notificationId,
    });
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

  it("updates only read state for the authenticated user's notification", async () => {
    const { updateQuery } = setup();
    await expect(markNotificationRead(notificationId)).resolves.toEqual({ success: true });
    expect(updateQuery.eq).toHaveBeenNthCalledWith(1, "id", notificationId);
    expect(updateQuery.eq).toHaveBeenNthCalledWith(2, "user_id", userId);
  });
});
