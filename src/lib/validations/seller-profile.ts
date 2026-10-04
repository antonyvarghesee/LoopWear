import { z } from "zod";

export const sellerUsernameSchema = z.string().regex(/^[A-Za-z0-9_]{3,20}$/, "Enter a valid seller username.");
export const sellerPageSchema = z.number().int().min(1).max(100_000).default(1);
export const SELLER_LISTING_PAGE_SIZE = 12;

export function sellerProfileHref(username: string): string | null {
  const parsed = sellerUsernameSchema.safeParse(username);
  return parsed.success ? `/seller/${encodeURIComponent(parsed.data)}` : null;
}

export function sellerPageHref(username: string, page: number): string | null {
  const base = sellerProfileHref(username);
  const parsedPage = sellerPageSchema.safeParse(page);
  if (!base || !parsedPage.success) return null;
  return parsedPage.data === 1 ? base : `${base}?page=${parsedPage.data}`;
}
