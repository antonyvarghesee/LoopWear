import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { buttonVariants } from "@/components/ui/button";
import { SellerListingCard } from "@/components/listings/seller-listing-card";
import { getOwnListings } from "@/services/listings";
import { requireAuth } from "@/services/auth";
import type { ListingStatus } from "@/types/listing-management";

export const metadata: Metadata = { title: "Your listings" };

const filters: Array<{ status: "ALL" | ListingStatus; label: string }> = [
  { status: "ALL", label: "All" },
  { status: "DRAFT", label: "Drafts" },
  { status: "ACTIVE", label: "Active" },
  { status: "SOLD", label: "Sold" },
  { status: "ARCHIVED", label: "Archived" },
  { status: "REMOVED", label: "Removed" },
];

export default async function ListingsDashboardPage({ searchParams }: { searchParams: Promise<{ status?: string; saved?: string; updated?: string }> }) {
  await connection();
  await requireAuth();
  const [listings, params] = await Promise.all([getOwnListings(), searchParams]);
  const status = filters.find((filter) => filter.status === params.status)?.status ?? "ALL";
  const visible = status === "ALL" ? listings : listings.filter((listing) => listing.status === status);
  const counts = new Map(filters.map((filter) => [filter.status, filter.status === "ALL" ? listings.length : listings.filter((listing) => listing.status === filter.status).length]));

  return <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">Seller space</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Your listings</h1><p className="mt-2 text-muted-foreground">Keep drafts moving and manage the pieces you’ve shared.</p></div>
      <Link href="/sell" className={buttonVariants({ className: "h-10" })}>Create a listing</Link>
    </div>
    {params.saved === "1" && <p role="status" className="mt-6 rounded-xl border border-emerald-600/20 bg-emerald-600/5 p-4 text-sm text-foreground">Draft saved. You can publish it whenever it’s ready.</p>}
    {params.updated === "1" && <p role="status" className="mt-6 rounded-xl border border-emerald-600/20 bg-emerald-600/5 p-4 text-sm text-foreground">Listing status updated.</p>}
    <nav aria-label="Filter listings by status" className="mt-8 flex gap-2 overflow-x-auto border-b border-border pb-3">{filters.map((filter) => <Link key={filter.status} href={filter.status === "ALL" ? "/dashboard/listings" : `/dashboard/listings?status=${filter.status}`} aria-current={status === filter.status ? "page" : undefined} className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium ${status === filter.status ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{filter.label}<span className="ml-2 text-xs opacity-75">{counts.get(filter.status)}</span></Link>)}</nav>
    {visible.length ? <div className="mt-6 grid gap-4">{visible.map((listing) => <SellerListingCard key={listing.id} listing={listing} />)}</div> : <div className="mt-8 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center"><p className="text-lg font-semibold">{status === "ALL" ? "No listings yet" : `No ${status.toLowerCase()} listings`}</p><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{status === "ALL" ? "Start with a draft. Add the details now and publish when you’re ready." : "Listings in this section will appear here."}</p>{status === "ALL" && <Link href="/sell" className={`${buttonVariants({ variant: "outline" })} mt-5`}>Create your first listing</Link>}</div>}
  </main>;
}
