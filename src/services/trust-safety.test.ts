import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser, from, rpc, insert, deleteQuery } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(),
  deleteQuery: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import {
  getConversationBlockState,
  setUserBlock,
  submitTrustSafetyReport,
} from "@/services/trust-safety";

const currentUserId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";
const conversationId = "00000000-0000-4000-8000-000000000003";
const targetId = "00000000-0000-4000-8000-000000000004";

describe("trust and safety service", () => {
  beforeEach(() => {
    getCurrentUser.mockReset().mockResolvedValue({ id: currentUserId });
    insert.mockReset().mockResolvedValue({ error: null });
    deleteQuery.mockReset();
    rpc.mockReset().mockResolvedValue({ data: true, error: null });
    from.mockReset().mockImplementation((table: string) => {
      if (table === "reports") return { insert };
      if (table === "user_blocks") {
        return {
          insert,
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({
            data: { buyer_id: currentUserId, seller_id: otherUserId },
            error: null,
          }) })),
        })),
      };
    });
    createSupabaseServerClient.mockReset().mockResolvedValue({ from, rpc });
  });

  it("rejects unauthenticated and malformed reports before insertion", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    await expect(submitTrustSafetyReport({
      targetType: "user",
      targetId,
      reason: "safety",
    })).resolves.toMatchObject({ success: false });

    await expect(submitTrustSafetyReport({
      targetType: "invalid",
      targetId: "not-a-uuid",
      reason: "",
      reporter_id: otherUserId,
      status: "resolved",
    })).resolves.toMatchObject({ success: false });
    expect(insert).not.toHaveBeenCalled();
  });

  it("submits only validated target/reason/description and handles active duplicates", async () => {
    await expect(submitTrustSafetyReport({
      targetType: "message",
      targetId,
      reason: "harassment",
      description: "Repeated unwanted messages",
    })).resolves.toEqual({ success: true });
    expect(insert).toHaveBeenCalledWith({
      target_type: "message",
      target_id: targetId,
      reason: "harassment",
      description: "Repeated unwanted messages",
    });

    insert.mockResolvedValueOnce({ error: { code: "23505" } });
    await expect(submitTrustSafetyReport({
      targetType: "user",
      targetId,
      reason: "safety",
    })).resolves.toEqual({
      success: false,
      error: "You already have an active report for this item.",
    });
  });

  it("rejects invalid descriptions", async () => {
    await expect(submitTrustSafetyReport({
      targetType: "user",
      targetId,
      reason: "safety",
      description: "x".repeat(2001),
    })).resolves.toMatchObject({ success: false });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects self-blocking and allows a valid block without a client blocker ID", async () => {
    await expect(setUserBlock(currentUserId, true)).resolves.toEqual({
      success: false,
      error: "You cannot block yourself.",
    });
    expect(insert).not.toHaveBeenCalled();

    await expect(setUserBlock(otherUserId, true)).resolves.toEqual({ success: true });
    expect(insert).toHaveBeenCalledWith({ blocked_id: otherUserId });
  });

  it("rejects unauthenticated block changes", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    await expect(setUserBlock(otherUserId, true)).resolves.toEqual({
      success: false,
      error: "Sign in to manage blocks.",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("removes only the current user's block for the requested user", async () => {
    await expect(setUserBlock(otherUserId, false)).resolves.toEqual({ success: true });
    const blocksQuery = from.mock.results.find((result) => result.type === "return" && result.value.delete);
    expect(blocksQuery?.value.delete).toHaveBeenCalled();
  });

  it("distinguishes the current user's block from an unavailable conversation", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    const state = await getConversationBlockState(conversationId);
    expect(state).toMatchObject({
      canSend: false,
      currentUserBlockedOther: false,
      otherBlockedCurrentUser: true,
      otherUserId,
    });
    expect(rpc).toHaveBeenCalledWith("can_send_conversation_message", {
      p_conversation_id: conversationId,
    });
  });

  it("keeps an existing conversation read-only when either participant blocks the other", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(getConversationBlockState(conversationId)).resolves.toMatchObject({
      canSend: false,
      otherBlockedCurrentUser: true,
    });
  });
});
