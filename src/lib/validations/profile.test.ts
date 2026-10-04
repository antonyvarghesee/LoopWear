import { describe, expect, it } from "vitest";

import { updateProfileSchema } from "./profile";

describe("Profile Validation Schemas", () => {
  it("validates a valid profile update payload", () => {
    const result = updateProfileSchema.safeParse({
      username: "denim_pro",
      fullName: "Marcus Chen",
      bio: "Collector of raw Japanese selvedge denim.",
      location: "San Francisco, CA",
    });
    expect(result.success).toBe(true);
  });

  it("allows empty optional fields", () => {
    const result = updateProfileSchema.safeParse({
      username: "minimalist",
      fullName: "",
      bio: "",
      location: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid usernames", () => {
    const result = updateProfileSchema.safeParse({
      username: "invalid user@name",
      fullName: "Test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects bios over 300 characters", () => {
    const longBio = "a".repeat(301);
    const result = updateProfileSchema.safeParse({
      username: "valid_user",
      bio: longBio,
    });
    expect(result.success).toBe(false);
  });
});
