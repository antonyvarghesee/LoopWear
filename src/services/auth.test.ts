import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }));

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); },
}));

import { getCurrentUser, requireAuth } from "@/services/auth";

describe("server authentication helpers", () => {
  beforeEach(() => createSupabaseServerClient.mockReset());

  it("returns null for a genuinely absent session", async () => {
    createSupabaseServerClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } }) } });
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("surfaces Supabase failures instead of treating them as signed out", async () => {
    createSupabaseServerClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("network failed") }) } });
    await expect(getCurrentUser()).rejects.toThrow("Unable to verify your session. Please try again.");
  });

  it("redirects a signed-out user to the login route", async () => {
    createSupabaseServerClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } }) } });
    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("includes the protected page as the login return destination", async () => {
    createSupabaseServerClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } }) } });
    await expect(requireAuth("/settings/profile")).rejects.toThrow("NEXT_REDIRECT:/login?next=%2Fsettings%2Fprofile");
  });
});
