import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { MapPin, PackageCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { BrowseListingCard } from "@/components/listings/browse-listing-card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/services/auth";
import { getFavoriteListingIds } from "@/services/favorites";
import { getPublicSellerProfile, getSellerActiveListings } from "@/services/seller-profiles";
import { sellerPageHref, sellerPageSchema, sellerUsernameSchema } from "@/lib/validations/seller-profile";

type SellerRouteProps = { params: Promise<{ username: string }>; searchParams: Promise<{ page?: string | string[] }> };
const getCachedSeller = cache(getPublicSellerProfile);

export async function generateMetadata({ params }: SellerRouteProps): Promise<Metadata> {
  const { username } = await params;
  const seller = await getCachedSeller(username);
  if (!seller) return { title: "Seller not found | LoopWear" };
  const displayName = seller.full_name?.trim() || `@${seller.username}`;
  return {
    title: `${displayName} (@${seller.username}) | LoopWear`,
    description: seller.bio?.trim().slice(0, 160) || `Browse active pre-loved clothing listed by ${displayName} on LoopWear.`,
  };
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}` : name.slice(0, 2)).toUpperCase();
}

export default async function SellerProfilePage({ params, searchParams }: SellerRouteProps) {
  await connection();
  const { username } = await params;
  if (!sellerUsernameSchema.safeParse(username).success) notFound();
  const seller = await getCachedSeller(username);
  if (!seller) notFound();

  const query = await searchParams;
  const rawPage = typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 1;
  const page = sellerPageSchema.safeParse(rawPage).success ? rawPage : 1;
  let listings: Awaited<ReturnType<typeof getSellerActiveListings>>["listings"] = [];
  let total = 0;
  let pageSize = 12;
  let failed = false;
  try {
    const result = await getSellerActiveListings(seller.username, page);
    listings = result.listings;
    total = result.total;
    pageSize = result.pageSize;
  } catch {
    failed = true;
  }
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (!failed && total > 0 && page > lastPage) {
    const lastPageHref = sellerPageHref(seller.username, lastPage);
    if (lastPageHref) redirect(lastPageHref);
  }

  const user = await getCurrentUser();
  let favoriteIds = new Set<string>();
  if (user && listings.length > 0) {
    try {
      favoriteIds = new Set(await getFavoriteListingIds(listings.map((listing) => listing.id)));
    } catch {
      favoriteIds = new Set();
    }
  }
  const displayName = seller.full_name?.trim() || seller.username;
  const pages = lastPage;
  const previousHref = sellerPageHref(seller.username, page - 1);
  const nextHref = sellerPageHref(seller.username, page + 1);

  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <header className="mb-9 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
        <Avatar src={seller.avatar_url ?? undefined} alt={`${displayName}’s profile photo`} fallback={initials(displayName)} size="lg" className="size-20 text-2xl sm:size-24" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-primary">LOOPWEAR SELLER</p>
          <h1 className="mt-1 break-words text-3xl font-semibold tracking-tight">{displayName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">@{seller.username}</p>
          {seller.bio && <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-6">{seller.bio}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {seller.location && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden="true" />{seller.location}</span>}
            <span>Member since {new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(seller.created_at))}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-xl bg-muted/60 px-4 py-3 text-sm">
          <PackageCheck className="size-4 text-primary" aria-hidden="true" />
          <span><strong className="font-semibold text-foreground">{total}</strong> active {total === 1 ? "listing" : "listings"}</span>
        </div>
      </div>
    </header>

    <section aria-labelledby="seller-listings-heading">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div><h2 id="seller-listings-heading" className="text-xl font-semibold">Active listings</h2><p className="mt-1 text-sm text-muted-foreground">Pieces currently available from @{seller.username}.</p></div>
        {total > 0 && <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>}
      </div>
      {failed ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm"><p className="font-medium">Listings are temporarily unavailable.</p><p className="mt-1 text-muted-foreground">Please refresh the page in a moment.</p></div>
        : listings.length > 0 ? <>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">{listings.map((listing) => <BrowseListingCard key={listing.id} listing={listing} authenticated={Boolean(user)} isFavorite={favoriteIds.has(listing.id)} returnTo={sellerPageHref(seller.username, page) ?? `/seller/${encodeURIComponent(seller.username)}`} />)}</div>
          {pages > 1 && <nav className="mt-8 flex items-center justify-center gap-4" aria-label="Seller listing pages">
            {previousHref ? <Link href={previousHref} rel="prev" className="rounded-lg border px-4 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Previous</Link> : <span />}
            <span className="text-sm text-muted-foreground" aria-current="page">Page {page} of {pages}</span>
            {page < pages && nextHref ? <Link href={nextHref} rel="next" className="rounded-lg border px-4 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Next</Link> : <span />}
          </nav>}
        </> : <EmptyState title="No active listings" description={`${displayName} doesn’t have any active listings right now.`} />}
    </section>
  </main>;
}
