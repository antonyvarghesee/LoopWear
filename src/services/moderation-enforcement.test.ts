import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

import { isCurrentUserSuspended } from "@/services/moderation-enforcement";

describe("current-user moderation enforcement lookup", () => {
  beforeEach(() => createSupabaseServerClient.mockReset());

  it("calls the zero-argument session-derived suspension RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    await expect(isCurrentUserSuspended()).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("is_current_user_suspended");
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("fails closed when suspension status cannot be verified", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("database detail") });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    await expect(isCurrentUserSuspended()).rejects.toThrow("Account status could not be verified.");
  });
});
