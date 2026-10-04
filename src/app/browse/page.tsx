import Link from "next/link";
import { AlertCircle, Search } from "lucide-react";
import { BrowseListingCard } from "@/components/listings/browse-listing-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { hasBrowseCriteria, browseParamsToQuery, parseBrowseParams, type SearchParamsInput } from "@/lib/validations/browse";
import { listingConditions, listingGenders } from "@/lib/validations/listing";
import { getBrowseOptions, searchActiveListings } from "@/services/browse";
import type { ListingRecord } from "@/types/listing-management";
import { getCurrentUser } from "@/services/auth";
import { getFavoriteListingIds } from "@/services/favorites";

export const metadata = { title: "Browse pre-loved clothes | LoopWear", description: "Search and discover pre-loved clothing from the LoopWear community." };

function FilterFields({ categories, brands, values }: { categories: { slug: string; name: string }[]; brands: { slug: string; name: string }[]; values: ReturnType<typeof parseBrowseParams> }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
    <label className="grid gap-1.5 text-sm font-medium">Category<Select name="category" defaultValue={values.category}><option value="">All categories</option>{categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</Select></label>
    <label className="grid gap-1.5 text-sm font-medium">Brand<Select name="brand" defaultValue={values.brand}><option value="">All brands</option>{brands.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</Select></label>
    <label className="grid gap-1.5 text-sm font-medium">Gender<Select name="gender" defaultValue={values.gender}><option value="">All genders</option>{listingGenders.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
    <label className="grid gap-1.5 text-sm font-medium">Condition<Select name="condition" defaultValue={values.condition}><option value="">Any condition</option>{listingConditions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
    <div className="grid grid-cols-2 gap-3"><label className="grid gap-1.5 text-sm font-medium">Min price<Input name="minPrice" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={values.minPrice} /></label><label className="grid gap-1.5 text-sm font-medium">Max price<Input name="maxPrice" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={values.maxPrice} /></label></div>
    <label className="grid gap-1.5 text-sm font-medium">Color<Input name="color" maxLength={60} defaultValue={values.color} /></label>
    <label className="grid gap-1.5 text-sm font-medium">Material<Input name="material" maxLength={100} defaultValue={values.material} /></label>
    <label className="grid gap-1.5 text-sm font-medium">Location<Input name="location" maxLength={120} defaultValue={values.location} /></label>
    <label className="grid gap-1.5 text-sm font-medium">Sort by<Select name="sort" defaultValue={values.sort}><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></Select></label>
  </div>;
}

function Pagination({ values, total, pageSize }: { values: ReturnType<typeof parseBrowseParams>; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (page: number) => `/browse${browseParamsToQuery(values, page) ? `?${browseParamsToQuery(values, page)}` : ""}`;
  if (pages <= 1) return null;
  return <nav className="mt-8 flex items-center justify-center gap-4" aria-label="Browse pages">
    {values.page > 1 ? <Link className={buttonVariants({ variant: "outline" })} href={link(values.page - 1)} rel="prev">Previous</Link> : <Button variant="outline" disabled aria-label="Previous page">Previous</Button>}
    <span className="text-sm text-muted-foreground" aria-current="page">Page {values.page} of {pages}</span>
    {values.page < pages ? <Link className={buttonVariants({ variant: "outline" })} href={link(values.page + 1)} rel="next">Next</Link> : <Button variant="outline" disabled aria-label="Next page">Next</Button>}
  </nav>;
}

export default async function BrowsePage({ searchParams }: { searchParams: Promise<SearchParamsInput> }) {
  const values = parseBrowseParams(await searchParams);
  let options: Awaited<ReturnType<typeof getBrowseOptions>> = { categories: [], brands: [] };
  let listings: ListingRecord[] = [];
  let total = 0;
  let pageSize = 12;
  let failed = false;
  let userId: string | null = null;
  let favoriteIds = new Set<string>();
  try {
    const user = await getCurrentUser();
    userId = user?.id ?? null;
    options = await getBrowseOptions();
    const result = await searchActiveListings(values, options);
    listings = result.listings;
    total = result.total;
    pageSize = result.pageSize;
    if (user) favoriteIds = new Set(await getFavoriteListingIds(listings.map((listing) => listing.id)));
  } catch {
    failed = true;
  }
  const criteria = hasBrowseCriteria(values);
  const clearHref = "/browse";
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <header className="mb-7"><p className="text-sm font-medium text-primary">LOOPWEAR MARKETPLACE</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Find your next favorite</h1><p className="mt-2 text-muted-foreground">Explore pre-loved pieces from the community.</p></header>
    <form action="/browse" method="get" className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="h-fit rounded-xl border bg-card p-4 lg:sticky lg:top-6">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Filters</h2>{criteria && <Link className="text-sm text-primary underline underline-offset-4" href={clearHref}>Clear all</Link>}</div>
        <label className="mb-4 grid gap-1.5 text-sm font-medium">Search listings<span className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/><Input className="pl-9" type="search" name="q" aria-label="Search listings" placeholder="Try denim jacket" maxLength={120} defaultValue={values.q}/></span></label>
        <details open className="group"><summary className="mb-3 cursor-pointer text-sm font-medium lg:hidden">Category, price & more</summary><FilterFields categories={options.categories} brands={options.brands} values={values}/></details>
        <Button type="submit" className="mt-5 w-full">Apply filters</Button>
      </aside>
      <section aria-label="Active listings">
        {failed ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm"><AlertCircle className="mb-2 h-5 w-5 text-destructive"/><p className="font-medium">Listings are temporarily unavailable.</p><p className="mt-1 text-muted-foreground">Please refresh the page in a moment.</p></div> : listings.length ? <>
          <div className="mb-4 flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{total} {total === 1 ? "listing" : "listings"}</p><p className="text-sm text-muted-foreground">Page {values.page} of {Math.max(1, Math.ceil(total / pageSize))}</p></div>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">{listings.map((listing) => <BrowseListingCard key={listing.id} listing={listing} isFavorite={favoriteIds.has(listing.id)} authenticated={Boolean(userId)} returnTo={`/browse${browseParamsToQuery(values) ? `?${browseParamsToQuery(values)}` : ""}`}/>)}</div>
          <Pagination values={values} total={total} pageSize={pageSize}/>
        </> : <><EmptyState title={criteria ? "No listings found" : "No listings yet"} description={criteria ? "No active listings match your search and filters. Try adjusting them or clear all filters." : "Check back soon for new pre-loved pieces."}/>{criteria && <p className="mt-3 text-center"><Link className="text-sm text-primary underline" href={clearHref}>Clear filters</Link></p>}</>}
        {!failed && values.page > 1 && listings.length === 0 && <p className="mt-3 text-center"><Link className="text-sm text-primary underline" href="/browse">Return to the first page</Link></p>}
      </section>
    </form>
  </div>;
}
