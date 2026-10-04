import { describe, expect, it } from "vitest";
import { sellerPageHref, sellerProfileHref, sellerUsernameSchema } from "@/lib/validations/seller-profile";

describe("seller profile username and URLs", () => {
  it("accepts valid usernames and safely builds public paths", () => {
    expect(sellerUsernameSchema.safeParse("Loop_Wear7").success).toBe(true);
    expect(sellerProfileHref("Loop_Wear7")).toBe("/seller/Loop_Wear7");
    expect(sellerPageHref("Loop_Wear7", 2)).toBe("/seller/Loop_Wear7?page=2");
  });

  it("rejects malformed usernames and page values", () => {
    for (const username of ["ab", "bad name", "name@example.com", "../admin", "x".repeat(21)]) {
      expect(sellerUsernameSchema.safeParse(username).success).toBe(false);
      expect(sellerProfileHref(username)).toBeNull();
    }
    expect(sellerPageHref("Loop_Wear7", 0)).toBeNull();
  });
});
