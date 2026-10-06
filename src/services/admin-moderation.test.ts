import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, requireAdmin } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/admin-auth", () => ({ requireAdmin }));

import { moderateListing, moderateReport, moderateUser } from "@/services/admin-moderation";

const adminUser = { id: "00000000-0000-4000-8000-000000000001" };
const reportId = "00000000-0000-4000-8000-000000000002";
const listingId = "00000000-0000-4000-8000-000000000003";
const userId = "00000000-0000-4000-8000-000000000004";

describe("admin moderation services", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    requireAdmin.mockReset().mockResolvedValue(adminUser);
  });

  function setup(status = "pending", updateResult = { data: { id: reportId }, error: null }) {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
      update: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle
      .mockResolvedValueOnce({ data: { id: reportId, status }, error: null })
      .mockResolvedValue(updateResult);
    query.update.mockReturnValue(query);
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query), rpc });
    return { query, rpc };
  }

  it.each([
    ["pending", "reviewed"],
    ["pending", "resolved"],
    ["pending", "dismissed"],
    ["reviewed", "resolved"],
    ["reviewed", "dismissed"],
  ])("allows report transition %s -> %s through only status/note updates", async (status, action) => {
    const { query } = setup(status);
    await expect(moderateReport({
      reportId,
      action,
      ...(action === "reviewed" ? {} : { resolutionNote: "Reviewed safely." }),
    }))
      .resolves.toEqual({ success: true });
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(query.update).toHaveBeenCalledWith({
      status: action,
      resolution_note: action === "reviewed" ? null : "Reviewed safely.",
    });
  });

  it("rejects closed/invalid report transitions and oversized notes before querying", async () => {
    setup("resolved");
    await expect(moderateReport({ reportId, action: "reviewed" })).resolves.toMatchObject({ success: false });
    await expect(moderateReport({ reportId, action: "resolved", resolutionNote: "x".repeat(2001) }))
      .resolves.toMatchObject({ success: false });
    await expect(moderateReport({
      reportId,
      action: "resolved",
      reporter_id: adminUser.id,
      target_id: listingId,
      description: "tampered",
    })).resolves.toMatchObject({ success: false });
  });

  it("fails closed when admin authorization fails", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
    await expect(moderateReport({ reportId, action: "resolved" })).rejects.toThrow("forbidden");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("uses the listing moderation setter without accepting an actor or changing listing status", async () => {
    const { rpc } = setup();
    await expect(moderateListing({ listingId, state: "hidden", note: "Policy violation." }))
      .resolves.toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("set_listing_moderation_state", {
      p_listing_id: listingId,
      p_moderation_state: "hidden",
      p_note: "Policy violation.",
    });
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("actor_id");
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("status");
  });

  it("fails safely when the listing moderation setter rejects a missing target", async () => {
    const { rpc } = setup();
    rpc.mockResolvedValueOnce({ error: { code: "22023" } });
    await expect(moderateListing({ listingId, state: "hidden" })).resolves.toMatchObject({ success: false });
  });

  it("uses the user moderation setter and rejects self-moderation", async () => {
    const { rpc } = setup();
    await expect(moderateUser({ userId, state: "suspended" })).resolves.toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("set_user_moderation_state", {
      p_user_id: userId,
      p_moderation_state: "suspended",
      p_note: null,
    });

    await expect(moderateUser({ userId: adminUser.id, state: "suspended" }))
      .resolves.toEqual({ success: false, error: "You cannot change your own moderation status." });
    await expect(moderateUser({ userId: adminUser.id, state: "normal" }))
      .resolves.toEqual({ success: false, error: "You cannot change your own moderation status." });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("rejects unauthenticated or non-admin moderation before database writes", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
    await expect(moderateListing({ listingId, state: "hidden" })).rejects.toThrow("forbidden");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
