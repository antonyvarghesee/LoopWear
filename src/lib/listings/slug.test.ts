import { describe, expect, it } from "vitest";
import { slugifyListingTitle, uniqueSlugFromExisting } from "./slug";

describe("listing slugs", () => {
  it("creates a URL-friendly slug from the title", () => {
    expect(slugifyListingTitle("Vintage Levi's Denim Jacket!")).toBe("vintage-levi-s-denim-jacket");
    expect(slugifyListingTitle(" -- ")).toBe("listing");
  });

  it("adds an incrementing suffix when a slug is already taken", () => {
    expect(uniqueSlugFromExisting("Vintage Denim Jacket", ["vintage-denim-jacket", "vintage-denim-jacket-2"]))
      .toBe("vintage-denim-jacket-3");
  });
});
