import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, createSupabaseServerClient, requireAdmin } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/admin-auth", () => ({ requireAdmin }));

import {
  getAdminListingModeration,
  getAdminModerationEvents,
  getAdminUserModeration,
} from "@/services/admin-console";

const listingId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function makeTableQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("admin moderation console read services", () => {
  beforeEach(() => {
    requireAdmin.mockReset().mockResolvedValue({ id: "admin-id" });
    createSupabaseAdminClient.mockReset();
    createSupabaseServerClient.mockReset();
  });

  it("reads only the target listing, safe seller identity, and separate moderation state", async () => {
    const listingQuery = makeTableQuery({ data: { id: listingId, title: "Coat", slug: "coat", status: "ACTIVE", seller_id: userId }, error: null });
    const profileQuery = makeTableQuery({ data: { username: "seller_1" }, error: null });
    const moderationQuery = makeTableQuery({ data: { moderation_state: "hidden" }, error: null });
    const from = vi.fn((table: string) => table === "listings" ? listingQuery : profileQuery);
    createSupabaseAdminClient.mockReturnValue({ from });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => moderationQuery) });

    await expect(getAdminListingModeration(listingId)).resolves.toEqual({
      status: "found",
      record: {
        id: listingId,
        title: "Coat",
        slug: "coat",
        status: "ACTIVE",
        sellerId: userId,
        sellerUsername: "seller_1",
        moderationState: "hidden",
      },
    });
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(listingQuery.select).toHaveBeenCalledWith("id,title,slug,status,seller_id");
    expect(listingQuery.eq).toHaveBeenCalledWith("id", listingId);
    expect(profileQuery.select).toHaveBeenCalledWith("username");
    expect(moderationQuery.select).toHaveBeenCalledWith("moderation_state");
    expect(from.mock.calls.map(([table]) => table)).toEqual(["listings", "profiles"]);
  });

  it("defaults an absent user moderation row to normal without reading private identity fields", async () => {
    const profileQuery = makeTableQuery({ data: { id: userId, username: "buyer_1", full_name: "Buyer" }, error: null });
    const moderationQuery = makeTableQuery({ data: null, error: null });
    const from = vi.fn((_table: string) => profileQuery);
    createSupabaseAdminClient.mockReturnValue({ from });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => moderationQuery) });

    await expect(getAdminUserModeration(userId)).resolves.toEqual({
      status: "found",
      record: {
        id: userId,
        username: "buyer_1",
        fullName: "Buyer",
        moderationState: "normal",
        updatedAt: null,
      },
    });
    expect(profileQuery.select).toHaveBeenCalledWith("id,username,full_name");
    expect(moderationQuery.select).toHaveBeenCalledWith("moderation_state,updated_at");
    expect(from.mock.calls.map(([table]) => table)).toEqual(["profiles"]);
  });

  it("reads only append-only audit fields through the authenticated database client", async () => {
    const query = {
      select: vi.fn(),
      order: vi.fn(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });

    await expect(getAdminModerationEvents()).resolves.toEqual([]);
    expect(query.select).toHaveBeenCalledWith("id,actor_id,subject_type,subject_id,action,note,report_id,created_at");
    expect(query.range).toHaveBeenCalledWith(0, 49);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("does not create elevated clients when the admin guard fails", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
    await expect(getAdminUserModeration(userId)).rejects.toThrow("forbidden");
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
