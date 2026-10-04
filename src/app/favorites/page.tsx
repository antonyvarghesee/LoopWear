import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BrowseListingCard } from "@/components/listings/browse-listing-card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/services/auth";
import { getFavoriteListings } from "@/services/favorites";

export const metadata = { title: "Your favorites | LoopWear", description: "The active listings you have saved on LoopWear." };

export default async function FavoritesPage() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Ffavorites");
  let listings;
  try {
    listings = await getFavoriteListings();
  } catch {
    return <main className="mx-auto max-w-7xl px-4 py-12"><div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm"><h1 className="font-semibold">Favorites are temporarily unavailable.</h1><p className="mt-1 text-muted-foreground">Please refresh the page in a moment.</p></div></main>;
  }
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <header className="mb-7"><h1 className="text-3xl font-semibold tracking-tight">Your favorites</h1><p className="mt-2 text-muted-foreground">Active listings you have saved.</p></header>
    {listings.length ? <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">{listings.map((listing) => <BrowseListingCard key={listing.id} listing={listing} authenticated isFavorite returnTo="/favorites" />)}</div>
      : <div><EmptyState title="No favorites yet" description="Save pieces you love and they’ll be easy to find here."/><p className="mt-4 text-center"><Link href="/browse" className="text-sm font-medium text-primary underline underline-offset-4">Browse listings</Link></p></div>}
  </main>;
}
