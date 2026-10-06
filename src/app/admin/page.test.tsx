import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  connection,
  requireAdmin,
  getAdminReports,
  getAdminModerationEvents,
  getAdminListingModeration,
  getAdminUserModeration,
  AdminModerationConsole,
} = vi.hoisted(() => ({
  connection: vi.fn(),
  requireAdmin: vi.fn(),
  getAdminReports: vi.fn(),
  getAdminModerationEvents: vi.fn(),
  getAdminListingModeration: vi.fn(),
  getAdminUserModeration: vi.fn(),
  AdminModerationConsole: vi.fn(() => null),
}));

vi.mock("next/server", () => ({ connection }));
vi.mock("@/services/admin-auth", () => ({ requireAdmin }));
vi.mock("@/services/admin-reports", () => ({ getAdminReports }));
vi.mock("@/services/admin-console", () => ({
  getAdminModerationEvents,
  getAdminListingModeration,
  getAdminUserModeration,
}));
vi.mock("@/components/admin/admin-moderation-console", () => ({ AdminModerationConsole }));

import AdminPage from "@/app/admin/page";

describe("admin moderation page authorization and data loading", () => {
  beforeEach(() => {
    connection.mockReset().mockResolvedValue(undefined);
    requireAdmin.mockReset().mockResolvedValue({ id: "admin-1" });
    getAdminReports.mockReset().mockResolvedValue([]);
    getAdminModerationEvents.mockReset().mockResolvedValue([]);
    getAdminListingModeration.mockReset();
    getAdminUserModeration.mockReset();
    AdminModerationConsole.mockClear();
  });

  it("requires the server admin guard before loading any moderation data", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("not authorized"));

    await expect(AdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("not authorized");
    expect(getAdminReports).not.toHaveBeenCalled();
    expect(getAdminModerationEvents).not.toHaveBeenCalled();
    expect(getAdminListingModeration).not.toHaveBeenCalled();
    expect(getAdminUserModeration).not.toHaveBeenCalled();
  });

  it("loads admin data with validated filters and scopes the rendered console to the admin identity", async () => {
    const page = await AdminPage({
      searchParams: Promise.resolve({
        status: "pending",
        targetType: "message",
        offset: "51",
        listingId: "00000000-0000-4000-8000-000000000001",
        userId: "00000000-0000-4000-8000-000000000002",
      }),
    });

    expect(getAdminReports).toHaveBeenCalledWith({
      status: "pending",
      targetType: "message",
      limit: 50,
      offset: 50,
    });
    expect(getAdminListingModeration).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
    expect(getAdminUserModeration).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000002");
    expect(page.type).toBe(AdminModerationConsole);
    expect(page.key).toBe("admin-1");
  });

  it("ignores invalid filters and caps report pagination", async () => {
    await AdminPage({ searchParams: Promise.resolve({ status: "all", targetType: "private", offset: "99999999999999999" }) });
    expect(getAdminReports).toHaveBeenCalledWith({ limit: 50, offset: 0 });
  });
});
