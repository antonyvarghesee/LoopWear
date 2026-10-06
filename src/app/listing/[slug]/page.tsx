import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { MapPin, ShieldCheck, Shirt, Star } from "lucide-react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { getActiveListingBySlug } from "@/services/listings";
import { getActiveListingImageUrls } from "@/services/listing-images";
import { ListingImageGallery } from "@/components/listings/listing-image-gallery";
import { FavoriteButton } from "@/components/listings/favorite-button";
import { MessageSellerButton } from "@/components/messaging/message-seller-button";
import { getCurrentUser } from "@/services/auth";
import { getFavoriteListingIds } from "@/services/favorites";
import { sellerProfileHref } from "@/lib/validations/seller-profile";
import { BuyNowButton } from "@/components/listings/buy-now-button";
import { ReviewDisplay } from "@/components/reviews/review-display";
import { getPublicSellerReviews, type PublicReview } from "@/services/reviews";
import { getUserBlockState } from "@/services/trust-safety";
import { ReportButton } from "@/components/trust-safety/report-button";
import { BlockUserButton } from "@/components/trust-safety/block-user-button";

const getCachedListing = cache(getActiveListingBySlug);

type ListingRouteProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: ListingRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getCachedListing(slug);
  if (!listing) return { title: "Listing not found" };
  return {
    title: listing.title,
    description: listing.description.slice(0, 160),
    openGraph: { title: listing.title, description: listing.description.slice(0, 160), type: "website" },
  };
}

export default async function ListingDetailPage({ params }: ListingRouteProps) {
  await connection();
  const { slug } = await params;
  const listing = await getCachedListing(slug);
  if (!listing) notFound();
  const images = await getActiveListingImageUrls(listing.id);
  const user = await getCurrentUser();
  let favorite = false;
  if (user) favorite = (await getFavoriteListingIds([listing.id])).includes(listing.id);
  const seller = listing.profiles;
  const sellerHref = seller?.username ? sellerProfileHref(seller.username) : null;
  let sellerBlocked = false;
  let blockStateUnavailable = false;
  if (user && user.id !== listing.seller_id) {
    try {
      sellerBlocked = await getUserBlockState(listing.seller_id);
    } catch {
      blockStateUnavailable = true;
    }
  }
  let reviews: PublicReview[] = [];
  let reviewsUnavailable = false;
  if (seller?.username) {
    try {
      reviews = await getPublicSellerReviews({ username: seller.username, listingId: listing.id, limit: 8 });
    } catch {
      reviewsUnavailable = true;
    }
  }
  const categoryName = Array.isArray(listing.categories) ? listing.categories[0]?.name : listing.categories?.name;
  const brandName = Array.isArray(listing.brands) ? listing.brands[0]?.name : listing.brands?.name;

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
    <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to LoopWear</Link>
    <article className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
      <div className="space-y-3">
        {images.length > 0 ? <ListingImageGallery images={images} listingTitle={listing.title} /> : <div className="relative aspect-square overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-muted to-muted/40 sm:aspect-[4/3]"><div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"><Shirt className="size-12" /><span className="text-sm">No photos for this listing</span></div></div>}
      </div>
      <div className="flex flex-col py-1">
        <div className="flex flex-wrap gap-2"><Badge variant="secondary">{listing.condition}</Badge><Badge variant="outline">{listing.gender}</Badge></div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">{brandName ?? "Pre-owned"}{categoryName ? ` · ${categoryName}` : ""}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{listing.title}</h1>
        <div className="mt-4"><FavoriteButton listingId={listing.id} isFavorite={favorite} authenticated={Boolean(user)} loginHref={`/listing/${encodeURIComponent(listing.slug)}`} /><MessageSellerButton listingId={listing.id} slug={listing.slug} authenticated={Boolean(user)} isSeller={user?.id === listing.seller_id} /></div>
        <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="text-3xl font-bold">₹{Number(listing.selling_price).toFixed(2)}</span>{listing.original_price != null && <span className="text-base text-muted-foreground line-through">₹{Number(listing.original_price).toFixed(2)}</span>}</div>
        {user && user.id !== listing.seller_id && listing.status === "ACTIVE" && <BuyNowButton listingId={listing.id} />}
        <p className="mt-6 whitespace-pre-line text-sm leading-7 text-muted-foreground">{listing.description}</p>
        <dl className="mt-7 grid grid-cols-2 gap-x-5 gap-y-4 rounded-2xl border border-border bg-card p-5 text-sm">
          <div><dt className="text-xs text-muted-foreground">Size</dt><dd className="mt-1 font-medium">{listing.size}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Condition</dt><dd className="mt-1 font-medium">{listing.condition}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Category</dt><dd className="mt-1 font-medium">{categoryName ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Brand</dt><dd className="mt-1 font-medium">{brandName ?? "Unbranded"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Style category</dt><dd className="mt-1 font-medium">{listing.gender}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Color</dt><dd className="mt-1 font-medium">{listing.color || "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Material</dt><dd className="mt-1 font-medium">{listing.material || "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Location</dt><dd className="mt-1 inline-flex items-center gap-1 font-medium">{listing.location ? <><MapPin className="size-3.5 text-muted-foreground" />{listing.location}</> : "—"}</dd></div>
        </dl>
        <section className="mt-6 rounded-2xl border border-border bg-card p-5" aria-labelledby="seller-heading">
          <h2 id="seller-heading" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Listed by</h2>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{(seller?.full_name || seller?.username || "LW").slice(0, 2).toUpperCase()}</span><div>{sellerHref ? <Link href={sellerHref} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><p className="flex items-center gap-1 text-sm font-semibold">{seller?.full_name || seller?.username}{seller?.is_verified && <ShieldCheck className="size-4 text-emerald-600" aria-label="Verified seller" />}</p><p className="text-xs text-muted-foreground">@{seller?.username}</p></Link> : <><p className="text-sm font-semibold">LoopWear member</p><p className="text-xs text-muted-foreground">@member</p></>}</div></div>
            {seller && <div className="flex items-center gap-1 text-sm"><Star className="size-4 fill-amber-400 text-amber-400" /><span>{Number(seller.rating).toFixed(1)}</span><span className="text-muted-foreground">({seller.review_count})</span></div>}
          </div>
          {user && seller && user.id !== listing.seller_id && !blockStateUnavailable && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <ReportButton targetType="listing" targetId={listing.id} label="Report listing" />
              <ReportButton targetType="user" targetId={listing.seller_id} label="Report seller" />
              <BlockUserButton userId={listing.seller_id} initiallyBlocked={sellerBlocked} />
            </div>
          )}
          {blockStateUnavailable && <p role="status" className="mt-3 text-xs text-muted-foreground">Block controls are temporarily unavailable.</p>}
        </section>
        <section className="mt-6 space-y-3" aria-labelledby="listing-reviews-heading">
          <div>
            <h2 id="listing-reviews-heading" className="text-lg font-semibold">Reviews for this listing</h2>
            <p className="mt-1 text-sm text-muted-foreground">Feedback from verified purchases.</p>
          </div>
          {reviewsUnavailable
            ? <p role="status" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Reviews are temporarily unavailable.</p>
            : <ReviewDisplay reviews={reviews} emptyMessage="No reviews for this listing yet." />}
        </section>
      </div>
    </article>
  </main>;
}
