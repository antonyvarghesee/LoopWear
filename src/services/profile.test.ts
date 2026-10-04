import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/auth", () => ({ getCurrentUser }));

import { updateProfileService } from "@/services/profile";

function profileQuery(result: { data: unknown; error: { code?: string; message: string } | null }) {
  const query = {
    payload: undefined as Record<string, unknown> | undefined,
    userId: undefined as string | undefined,
    update(payload: Record<string, unknown>) { this.payload = payload; return this; },
    eq(_column: string, id: string) { this.userId = id; return this; },
    select() { return this; },
    single: vi.fn(async () => result),
  };
  return query;
}

describe("updateProfileService", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getCurrentUser.mockReset();
  });

  it("updates only the authenticated user's editable profile fields", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-123" });
    const query = profileQuery({ data: { id: "user-123", username: "loop_style", full_name: "Loop Style", bio: null, location: null }, error: null });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });

    const result = await updateProfileService({ username: "loop_style", fullName: " Loop Style ", bio: "", location: "" });

    expect(result.success).toBe(true);
    expect(query.userId).toBe("user-123");
    expect(query.payload).toEqual({ username: "loop_style", full_name: "Loop Style", bio: null, location: null });
    expect(query.payload).not.toHaveProperty("is_verified");
    expect(query.payload).not.toHaveProperty("rating");
    expect(query.payload).not.toHaveProperty("review_count");
  });

  it("does not create a database client or write for an unauthenticated request", async () => {
    getCurrentUser.mockResolvedValue(null);
    const result = await updateProfileService({ username: "loop_style", fullName: "Loop Style", bio: "", location: "" });
    expect(result).toEqual({ success: false, error: "You must be signed in to update your profile." });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("converts a concurrent username unique-constraint race to a field error", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-123" });
    const query = profileQuery({ data: null, error: { code: "23505", message: "duplicate key" } });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => query) });
    await expect(updateProfileService({ username: "claimed_name", fullName: "Member", bio: "", location: "" })).resolves.toEqual({
      success: false,
      error: "That username is already in use. Please choose another.",
      field: "username",
    });
  });
});
