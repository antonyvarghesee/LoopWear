import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, requireAdmin } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/admin-auth", () => ({ requireAdmin }));

import { getAdminReports } from "@/services/admin-reports";

describe("admin report read service", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    requireAdmin.mockReset().mockResolvedValue({ id: "admin-id" });
  });

  it("requires admin authorization and selects only queue fields", async () => {
    const range = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn();
    const eq = vi.fn();
    const select = vi.fn();
    const query = { eq, order, range };
    eq.mockReturnValue(query);
    order.mockReturnValue(query);
    select.mockReturnValue(query);
    const from = vi.fn(() => ({ select }));
    createSupabaseServerClient.mockResolvedValue({ from });

    await expect(getAdminReports({ status: "pending", limit: 10, offset: 0 })).resolves.toEqual([]);
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("reports");
    expect(select).toHaveBeenCalledWith("id,reporter_id,target_type,target_id,reason,description,status,resolution_note,created_at,updated_at");
    expect(eq).toHaveBeenCalledWith("status", "pending");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(range).toHaveBeenCalledWith(0, 9);
  });

  it("does not query reports if admin authorization fails", async () => {
    requireAdmin.mockRejectedValue(new Error("forbidden"));
    await expect(getAdminReports()).rejects.toThrow("forbidden");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("rejects client-supplied identity and unsupported report statuses", async () => {
    await expect(getAdminReports({ userId: "someone-else" })).rejects.toThrow("Invalid admin reports query.");
    await expect(getAdminReports({ status: "anything" })).rejects.toThrow("Invalid admin reports query.");
    await expect(getAdminReports({ targetType: "all" })).rejects.toThrow("Invalid admin reports query.");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("supports the bounded target-type filter", async () => {
    const query = {
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    const select = vi.fn().mockReturnValue(query);
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => ({ select })) });

    await expect(getAdminReports({ targetType: "message", limit: 5, offset: 10 })).resolves.toEqual([]);
    expect(query.eq).toHaveBeenCalledWith("target_type", "message");
    expect(query.range).toHaveBeenCalledWith(10, 14);
  });
});
