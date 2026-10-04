import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  publicEnvSchema,
  isSupabaseConfigured,
  validateSupabaseEnv,
} from "./env";

describe("publicEnvSchema & Supabase env validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("accepts an empty object during scaffolding", () => {
    const result = publicEnvSchema.parse({});
    expect(result.NEXT_PUBLIC_APP_URL).toBeUndefined();
  });

  it("accepts a valid app URL", () => {
    const result = publicEnvSchema.parse({
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
    expect(result.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("correctly identifies missing Supabase configuration", () => {
    expect(isSupabaseConfigured()).toBe(false);
    const validation = validateSupabaseEnv();
    expect(validation.valid).toBe(false);
  });

  it("correctly identifies valid Supabase configuration", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    expect(isSupabaseConfigured()).toBe(true);
    const validation = validateSupabaseEnv();
    expect(validation.valid).toBe(true);
    expect(validation.error).toBeNull();
  });
});
