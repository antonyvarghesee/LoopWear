export function slugifyListingTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140)
    .replace(/-+$/g, "");
  return slug || "listing";
}

export function uniqueSlugFromExisting(title: string, existingSlugs: Iterable<string>): string {
  const taken = new Set(existingSlugs);
  const base = slugifyListingTitle(title);
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base.slice(0, 135)}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
