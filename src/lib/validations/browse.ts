import { listingConditions, listingGenders } from "@/lib/validations/listing";

export const BROWSE_PAGE_SIZE = 12;
export const browseSorts = ["newest", "price_asc", "price_desc"] as const;
export type BrowseSort = (typeof browseSorts)[number];
export type SearchParamsInput = Record<string, string | string[] | undefined>;

const decimal = (value: string | undefined) => {
  if (value === undefined || value.trim() === "") return undefined;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 99_999_999.99 ? number : undefined;
};

export interface BrowseFilters {
  q: string;
  category: string;
  brand: string;
  gender: string;
  condition: string;
  color: string;
  material: string;
  location: string;
  minPrice?: number;
  maxPrice?: number;
  sort: BrowseSort;
  page: number;
}

export function parseBrowseParams(params: SearchParamsInput): BrowseFilters {
  const first = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const rawSort = first("sort");
  const rawPage = first("page");
  const pageParsed = /^\d{1,6}$/.test(rawPage) ? Number(rawPage) : 1;
  let minPrice = decimal(first("minPrice"));
  let maxPrice = decimal(first("maxPrice"));
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    minPrice = undefined;
    maxPrice = undefined;
  }
  const boundedText = (key: string, max: number) => first(key).trim().slice(0, max);
  return {
    q: boundedText("q", 120),
    category: boundedText("category", 100),
    brand: boundedText("brand", 100),
    gender: (listingGenders as readonly string[]).includes(first("gender")) ? first("gender") : "",
    condition: (listingConditions as readonly string[]).includes(first("condition")) ? first("condition") : "",
    color: boundedText("color", 60), material: boundedText("material", 100), location: boundedText("location", 120),
    minPrice, maxPrice,
    sort: (browseSorts as readonly string[]).includes(rawSort) ? rawSort as BrowseSort : "newest",
    page: pageParsed >= 1 && pageParsed <= 100_000 ? pageParsed : 1,
  };
}

export function escapePostgrestSearch(value: string): string {
  // Quote the PostgREST filter value and escape its grammar delimiters. SQL is
  // still parameterized by PostgREST; this prevents punctuation becoming syntax.
  return `"%${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "\\%").replaceAll("_", "\\_")}%"`;
}

export function browseParamsToQuery(filters: BrowseFilters, page = filters.page): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({
    q: filters.q, category: filters.category, brand: filters.brand, gender: filters.gender,
    condition: filters.condition, color: filters.color, material: filters.material,
    location: filters.location, minPrice: filters.minPrice?.toString() ?? "",
    maxPrice: filters.maxPrice?.toString() ?? "", sort: filters.sort,
    page: page > 1 ? String(page) : "",
  })) if (value) params.set(key, value);
  return params.toString();
}

export function hasBrowseCriteria(filters: BrowseFilters): boolean {
  return Boolean(filters.q || filters.category || filters.brand || filters.gender || filters.condition || filters.color || filters.material || filters.location || filters.minPrice !== undefined || filters.maxPrice !== undefined);
}
