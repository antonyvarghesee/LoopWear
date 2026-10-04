import Image from "next/image";
import Link from "next/link";
import { MapPin, Package } from "lucide-react";
import type { ListingRecord } from "@/types/listing-management";
import { FavoriteButton } from "@/components/listings/favorite-button";

export function BrowseListingCard({ listing, isFavorite = false, authenticated = false, returnTo = "/browse" }: { listing: ListingRecord; isFavorite?: boolean; authenticated?: boolean; returnTo?: string }) {
  const category = Array.isArray(listing.categories) ? listing.categories[0]?.name : listing.categories?.name;
  const brand = Array.isArray(listing.brands) ? listing.brands[0]?.name : listing.brands?.name;
  const seller = listing.profiles;
  return (
    <article className="relative overflow-hidden rounded-xl border border-border/70 bg-card transition-shadow hover:shadow-md">
      <div className="relative">
      <Link href={`/listing/${encodeURIComponent(listing.slug)}`} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="relative aspect-[4/5] bg-muted">
        {listing.primaryImageUrl ? <Image src={listing.primaryImageUrl} alt={listing.title} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center text-muted-foreground" aria-label="No listing image"><Package className="h-10 w-10" aria-hidden="true" /></div>}
        <span className="absolute bottom-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur">{listing.condition}</span>
      </div>
      </Link>
      <div className="absolute right-3 top-3 z-10"><FavoriteButton listingId={listing.id} isFavorite={isFavorite} authenticated={authenticated} loginHref={returnTo} /></div>
      </div>
      <Link href={`/listing/${encodeURIComponent(listing.slug)}`} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="space-y-1.5 p-3 sm:p-4">
        <div className="flex min-h-4 justify-between gap-2 text-xs text-muted-foreground"><span className="truncate font-semibold uppercase tracking-wide">{brand}</span><span className="truncate">{category}</span></div>
        <h2 className="line-clamp-2 min-h-10 text-sm font-medium group-hover:text-primary">{listing.title}</h2>
        <p className="text-base font-semibold">${Number(listing.selling_price).toFixed(2)}</p>
        {(listing.location || seller) && <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
          {listing.location ? <span className="flex min-w-0 items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />{listing.location}</span> : <span />}
          {seller?.username && <span className="shrink-0">@{seller.username}</span>}
        </div>}
      </div>
      </Link>
    </article>
  );
}
