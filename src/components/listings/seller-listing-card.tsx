import Link from "next/link";
import { MapPin, Shirt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ListingManagementActions } from "@/components/listings/listing-management-actions";
import type { ListingRecord } from "@/types/listing-management";

const statusLabel: Record<ListingRecord["status"], string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  SOLD: "Sold",
  ARCHIVED: "Archived",
  REMOVED: "Removed",
};

export function SellerListingCard({ listing }: { listing: ListingRecord }) {
  const categoryName = Array.isArray(listing.categories) ? listing.categories[0]?.name : listing.categories?.name;
  const brandName = Array.isArray(listing.brands) ? listing.brands[0]?.name : listing.brands?.name;
  return <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
    <div className="flex flex-col sm:flex-row">
      <div className="flex min-h-44 items-center justify-center bg-muted/70 text-muted-foreground sm:w-44" aria-label="Listing image placeholder">
        <div className="flex flex-col items-center gap-2"><Shirt className="size-10" /><span className="text-xs">Photos coming later</span></div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-5 p-5 sm:p-6">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant={listing.status === "ACTIVE" ? "default" : "secondary"}>{statusLabel[listing.status]}</Badge><span className="text-xs text-muted-foreground">{categoryName ?? "Uncategorized"}{brandName ? ` · ${brandName}` : ""}</span></div>
          {listing.status === "ACTIVE" ? <Link href={`/listing/${listing.slug}`} className="text-lg font-semibold tracking-tight hover:text-primary">{listing.title}</Link>
            : listing.status === "DRAFT" || listing.status === "ARCHIVED" ? <Link href={`/sell/${listing.id}/edit`} className="text-lg font-semibold tracking-tight hover:text-primary">{listing.title}</Link>
              : <h2 className="text-lg font-semibold tracking-tight">{listing.title}</h2>}
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{listing.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"><span className="font-semibold">${Number(listing.selling_price).toFixed(2)}</span><span className="text-muted-foreground">Size {listing.size} · {listing.condition}</span>{listing.location && <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="size-3.5" />{listing.location}</span>}</div>
        </div>
        <ListingManagementActions listingId={listing.id} status={listing.status} />
      </div>
    </div>
  </article>;
}
