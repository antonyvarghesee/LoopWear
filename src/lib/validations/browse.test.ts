import { describe, expect, it } from "vitest";
import { browseParamsToQuery, escapePostgrestSearch, hasBrowseCriteria, parseBrowseParams } from "@/lib/validations/browse";

describe("browse URL parsing", () => {
  it("defaults empty and whitespace-only searches to newest page one", () => {
    expect(parseBrowseParams({ q: "   " })).toMatchObject({ q: "", sort: "newest", page: 1 });
    expect(hasBrowseCriteria(parseBrowseParams({ q: "  " }))).toBe(false);
  });
  it("keeps ordinary and special-character searches bounded and intact", () => {
    expect(parseBrowseParams({ q: "hoodie" }).q).toBe("hoodie");
    const special = `women's "jacket", (blue) 50%_`;
    expect(parseBrowseParams({ q: special }).q).toBe(special);
    expect(escapePostgrestSearch(special)).toContain('\\%');
    expect(escapePostgrestSearch(special)).toContain('\\_');
    expect(escapePostgrestSearch(special)).toContain('\\"');
  });
  it("validates prices, ranges, page numbers, and sort values safely", () => {
    expect(parseBrowseParams({ minPrice: "300", maxPrice: "1500" })).toMatchObject({ minPrice: 300, maxPrice: 1500 });
    for (const value of ["-1", "NaN", "12x", "1.234", "Infinity"]) expect(parseBrowseParams({ minPrice: value }).minPrice).toBeUndefined();
    expect(parseBrowseParams({ minPrice: "20", maxPrice: "10" })).toMatchObject({ minPrice: undefined, maxPrice: undefined });
    expect(parseBrowseParams({ page: "2" }).page).toBe(2);
    expect(parseBrowseParams({ page: "0" }).page).toBe(1);
    expect(parseBrowseParams({ page: "999999999999" }).page).toBe(1);
    expect(parseBrowseParams({ sort: "selling_price;drop table listings" }).sort).toBe("newest");
  });
  it("accepts allowlisted enum filters, ignores invalid values, and preserves URL state", () => {
    const parsed = parseBrowseParams({ category: "dresses", brand: "zara", gender: "Women", condition: "Good", color: "blue", q: "shirt", sort: "price_asc", page: "3" });
    expect(parsed).toMatchObject({ category: "dresses", brand: "zara", gender: "Women", condition: "Good" });
    expect(parseBrowseParams({ gender: "admin", condition: "unknown" })).toMatchObject({ gender: "", condition: "" });
    const url = new URLSearchParams(browseParamsToQuery(parsed, 2));
    expect(url.get("q")).toBe("shirt");
    expect(url.get("category")).toBe("dresses");
    expect(url.get("brand")).toBe("zara");
    expect(url.get("sort")).toBe("price_asc");
    expect(url.get("page")).toBe("2");
  });
});
