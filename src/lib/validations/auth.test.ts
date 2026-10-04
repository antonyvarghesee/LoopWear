import { describe, expect, it } from "vitest";

import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth";

describe("Auth Validation Schemas", () => {
  it("validates correct login credentials", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid login email or short password", () => {
    const result = loginSchema.safeParse({
      email: "invalid-email",
      password: "123",
    });
    expect(result.success).toBe(false);
  });

  it("validates correct registration input", () => {
    const result = registerSchema.safeParse({
      email: "seller@loopwear.com",
      password: "securepassword",
      confirmPassword: "securepassword",
      username: "vintage_king",
      fullName: "Alex Rivera",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid username characters in registration", () => {
    const result = registerSchema.safeParse({
      email: "seller@loopwear.com",
      password: "securepassword",
      confirmPassword: "securepassword",
      username: "alex king!",
      fullName: "Alex Rivera",
    });
    expect(result.success).toBe(false);
  });

  it("rejects registration when password confirmation differs", () => {
    const result = registerSchema.safeParse({
      email: "seller@loopwear.com",
      password: "securepassword",
      confirmPassword: "differentpassword",
      username: "vintage_king",
      fullName: "Alex Rivera",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("validates forgot password email", () => {
    expect(
      forgotPasswordSchema.safeParse({ email: "user@test.com" }).success,
    ).toBe(true);
    expect(
      forgotPasswordSchema.safeParse({ email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("validates reset password confirmation match", () => {
    const valid = resetPasswordSchema.safeParse({
      password: "newpassword123",
      confirmPassword: "newpassword123",
    });
    expect(valid.success).toBe(true);

    const mismatch = resetPasswordSchema.safeParse({
      password: "newpassword123",
      confirmPassword: "differentpassword",
    });
    expect(mismatch.success).toBe(false);
  });
});
