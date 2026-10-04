import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, updateProfileService } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  updateProfileService: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/services/profile", () => ({ updateProfileService }));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); },
}));

import { loginAction, registerAction } from "@/app/actions/auth";

describe("loginAction", () => {
  beforeEach(() => createSupabaseServerClient.mockReset());

  async function submitLogin(next?: string) {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({ auth: { signInWithPassword } });
    const formData = new FormData();
    formData.set("email", "person@example.com");
    formData.set("password", "safe-password-123");
    if (next !== undefined) formData.set("next", next);
    return loginAction(null, formData);
  }

  it("redirects normal login to home", async () => {
    await expect(submitLogin()).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("preserves a safe protected-route destination", async () => {
    await expect(submitLogin("/favorites")).rejects.toThrow("NEXT_REDIRECT:/favorites");
  });

  it("replaces a malicious destination with home", async () => {
    await expect(submitLogin("https://evil.example/steal")).rejects.toThrow("NEXT_REDIRECT:/");
  });
});

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
    const signUpOptions = signUp.mock.calls[0]![0].options;
    const callback = new URL(signUpOptions.emailRedirectTo);
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("next")).toBe("/verify-email");
    expect(result?.status).toBe("success");
  });
});
