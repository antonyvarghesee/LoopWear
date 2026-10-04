import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/auth-redirect";

describe("safeInternalPath", () => {
  it("defaults normal login and registration flows to the home page", () => {
    expect(safeInternalPath(undefined)).toBe("/");
    expect(safeInternalPath("")).toBe("/");
  });

  it("preserves protected-route return paths and their query strings", () => {
    expect(safeInternalPath("/favorites")).toBe("/favorites");
    expect(safeInternalPath("/settings/profile")).toBe("/settings/profile");
    expect(safeInternalPath("/dashboard/listings?status=ACTIVE")).toBe("/dashboard/listings?status=ACTIVE");
  });

  it("rejects external, protocol-relative, and backslash redirect URLs", () => {
    expect(safeInternalPath("https://evil.example/path")).toBe("/");
    expect(safeInternalPath("//evil.example/path")).toBe("/");
    expect(safeInternalPath("/\\evil.example/path")).toBe("/");
  });
});
