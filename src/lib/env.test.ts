import { describe, expect, it } from "vitest";

import { publicEnvSchema } from "./env";

describe("publicEnvSchema", () => {
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
});
