import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, updateProfileService } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  updateProfileService: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/profile", () => ({ updateProfileService }));

import { registerAction } from "@/app/actions/auth";

describe("registerAction", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    updateProfileService.mockReset();
  });

  it("continues to Auth when the optional username preflight read fails", async () => {
    const signUp = vi.fn().mockResolvedValue({ data: {}, error: null });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST000", message: "temporary profile lookup failure" },
    });
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle,
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn(() => query),
      auth: { signUp },
    });

    const formData = new FormData();
    formData.set("email", "person@example.com");
    formData.set("password", "safe-password-123");
    formData.set("confirmPassword", "safe-password-123");
    formData.set("username", "loopwear_user");
    formData.set("fullName", "Loopwear User");

    const result = await registerAction(null, formData);

    expect(maybeSingle).toHaveBeenCalledOnce();
    expect(signUp).toHaveBeenCalledOnce();
    expect(result?.status).toBe("success");
  });
});
