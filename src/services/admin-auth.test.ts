import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser, redirect } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/auth", () => ({ getCurrentUser }));

import { requireAdmin } from "@/services/admin-auth";

const user = { id: "00000000-0000-4000-8000-000000000001", email: "admin@example.test" };

describe("admin authorization", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getCurrentUser.mockReset();
    redirect.mockClear();
    rpc.mockReset();
    createSupabaseServerClient.mockResolvedValue({ rpc });
  });

  it("redirects unauthenticated users to sign in", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/login?next=%2Fadmin");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("rejects an authenticated non-admin", async () => {
    getCurrentUser.mockResolvedValue(user);
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(Reflect.apply(requireAdmin, undefined, [{ role: "admin", userId: user.id }]))
      .rejects.toThrow("NEXT_REDIRECT:/");
    expect(rpc).toHaveBeenCalledWith("has_admin_role");
  });

  it("returns the authenticated user when the database confirms admin access", async () => {
    getCurrentUser.mockResolvedValue(user);
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(requireAdmin()).resolves.toBe(user);
    expect(rpc).toHaveBeenCalledWith("has_admin_role");
  });

  it("fails closed when the database role check errors", async () => {
    getCurrentUser.mockResolvedValue(user);
    rpc.mockResolvedValue({ data: null, error: new Error("database detail") });
    await expect(requireAdmin()).rejects.toThrow("Admin access could not be verified.");
  });
});
